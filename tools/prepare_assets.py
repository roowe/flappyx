"""Convert the frozen ejoy2d asset snapshot to upright, straight-alpha PNGs."""

import argparse
import hashlib
import io
import json
import re
from pathlib import Path

from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "shared/assets/source"
SCREEN_SCALE = 16
MATRIX_SCALE = 1024
TOKEN = re.compile(r'\s*(return|false|true|-?\d+|"(?:[^"\\]|\\.)*"|[{}\[\]=,])')


class LuaTableReader:
    """Read only literal tables; Lua functions and expressions are never executed."""

    def __init__(self, text: str):
        self.tokens = []
        offset = 0
        while text[offset:].strip():
            match = TOKEN.match(text, offset)
            if match is None:
                raise ValueError(f"Unsupported Lua syntax at offset {offset}")
            self.tokens.append(match[1])
            offset = match.end()
        self.index = 0

    def consume(self, expected: str | None = None) -> str:
        if self.index == len(self.tokens):
            raise ValueError("Unexpected end of Lua table")
        token = self.tokens[self.index]
        self.index += 1
        if expected is not None and token != expected:
            raise ValueError(f"Expected {expected!r}, received {token!r}")
        return token

    def value(self):
        token = self.consume()
        if token == "{":
            result = {}
            array_index = 1
            while self.tokens[self.index] != "}":
                if self.tokens[self.index] == "[":
                    self.consume("[")
                    key = self.value()
                    self.consume("]")
                    self.consume("=")
                else:
                    key = array_index
                    array_index += 1
                if key in result:
                    raise ValueError(f"Duplicate Lua table key: {key!r}")
                result[key] = self.value()
                if self.tokens[self.index] != "}":
                    self.consume(",")
            self.consume("}")
            return result
        if token.startswith('"'):
            return json.loads(token)
        if token in ("true", "false"):
            return token == "true"
        return int(token)

    def read(self) -> dict:
        self.consume("return")
        table = self.value()
        if self.index != len(self.tokens) or not isinstance(table, dict):
            raise ValueError("Expected a single returned literal table")
        return table


def read_package() -> dict:
    tables = LuaTableReader((SOURCE / "birds.lua").read_text(encoding="utf-8")).read()
    return {table["export"]: table for table in tables.values()}


def straight_alpha(rgb: Image.Image, alpha: Image.Image) -> Image.Image:
    if rgb.mode != "RGB" or alpha.mode != "L" or rgb.size != alpha.size:
        raise ValueError("Expected same-size RGB PPM and grayscale PGM")
    colors = rgb.tobytes()
    opacity = alpha.tobytes()
    rgba = bytearray(len(opacity) * 4)
    for i, a in enumerate(opacity):
        for channel in range(3):
            c = colors[i * 3 + channel]
            if c > a:
                raise ValueError("Source RGB is not premultiplied alpha")
            rgba[i * 4 + channel] = (c * 255 + a // 2) // a if a else 0
        rgba[i * 4 + 3] = a
    return Image.frombytes("RGBA", rgb.size, bytes(rgba))


def points(table: dict) -> list[tuple[int, int]]:
    if set(table) != set(range(1, 9)):
        raise ValueError("Expected four 2D vertices")
    return [(table[i], table[i + 1]) for i in range(1, 9, 2)]


def upright_sprite(atlas: Image.Image, quad: dict) -> tuple[Image.Image, dict]:
    screen = points(quad["screen"])
    source = points(quad["src"])
    if quad["tex"] != 1:
        raise ValueError("This package must use one source atlas")
    left, top = min(x for x, _ in screen), min(y for _, y in screen)
    right, bottom = max(x for x, _ in screen), max(y for _, y in screen)
    x0, y0 = min(x for x, _ in source), min(y for _, y in source)
    x1, y1 = max(x for x, _ in source), max(y for _, y in source)
    if not (0 <= x0 < x1 <= atlas.width and 0 <= y0 < y1 <= atlas.height):
        raise ValueError("Sprite extends beyond the source atlas")
    if set(screen) != {(left, top), (right, top), (left, bottom), (right, bottom)}:
        raise ValueError("Expected rectangular screen vertices")
    if set(source) != {(x0, y0), (x1, y0), (x0, y1), (x1, y1)}:
        raise ValueError("Expected rectangular source vertices")
    corners = dict(zip(screen, source, strict=True))
    mapping = (corners[left, top], corners[right, top], corners[left, bottom])
    tl, tr, bl, br = (x0, y0), (x1, y0), (x0, y1), (x1, y1)
    orientations = {
        (tl, tr, bl): ("identity", None),
        (tr, br, tl): ("rotate90ccw", Image.Transpose.ROTATE_90),
        (br, bl, tr): ("rotate180", Image.Transpose.ROTATE_180),
        (bl, tl, br): ("rotate270ccw", Image.Transpose.ROTATE_270),
        (tr, tl, br): ("flipX", Image.Transpose.FLIP_LEFT_RIGHT),
        (bl, br, tl): ("flipY", Image.Transpose.FLIP_TOP_BOTTOM),
        (tl, bl, tr): ("transpose", Image.Transpose.TRANSPOSE),
        (br, tr, bl): ("transverse", Image.Transpose.TRANSVERSE),
    }
    name, operation = orientations[mapping]
    sprite = atlas.crop((x0, y0, x1, y1))
    if operation is not None:
        sprite = sprite.transpose(operation)
    return sprite, {
        "sourceBox": {"x": x0, "y": y0, "width": x1 - x0, "height": y1 - y0},
        "orientation": name,
        "sourceScreenBounds": {
            "left": left / SCREEN_SCALE, "top": top / SCREEN_SCALE,
            "right": right / SCREEN_SCALE, "bottom": bottom / SCREEN_SCALE,
        },
        "pixelSize": {"width": sprite.width, "height": sprite.height},
    }


def png_bytes(image: Image.Image) -> bytes:
    buffer = io.BytesIO()
    image.save(buffer, format="PNG")
    return buffer.getvalue()


def sprite_top_left(position: tuple, size: tuple, pivot: dict) -> tuple:
    return position[0] - size[0] * pivot["x"], position[1] - size[1] * pivot["y"]


def draw_previews(images: dict, sprites: list[dict]) -> dict[str, Image.Image]:
    sheet = Image.new("RGB", (1000, 820), "#192332")
    draw = ImageDraw.Draw(sheet)
    draw.text((24, 18), "FlappyX - upright sprites / straight alpha", fill="white", font_size=24)
    for i, sprite in enumerate(sprites):
        x, y = 24 + i % 3 * 326, 62 + i // 3 * 248
        for cy in range(y + 44, y + 226, 14):
            for cx in range(x, x + 308, 14):
                color = "#e8e8e8" if ((cx - x) // 14 + (cy - y) // 14) % 2 else "#bfc5ce"
                draw.rectangle((cx, cy, cx + 13, cy + 13), fill=color)
        draw.text((x, y), sprite["id"], fill="white", font_size=18)
        image = images[sprite["id"]]
        scale = min(4, 290 / image.width, 164 / image.height)
        display = image.resize((round(image.width * scale), round(image.height * scale)), Image.Resampling.NEAREST)
        sheet.paste(display, (x + (308 - display.width) // 2, y + 44 + (182 - display.height) // 2), display)

    config = json.loads((ROOT / "shared/config/gameplay.json").read_text(encoding="utf-8"))
    scene = Image.new("RGBA", (config["canvas"]["width"], config["canvas"]["height"]), config["render"]["clearColor"])
    ground_top = config["ground"]["topY"]
    by_id = {sprite["id"]: sprite for sprite in sprites}

    def sized(sprite_id: str, height: int | None = None) -> Image.Image:
        size = by_id[sprite_id]["displaySize"]
        if size["height"] is None and height is None:
            raise ValueError(f"Dynamic sprite requires an explicit height: {sprite_id}")
        return images[sprite_id].resize((round(size["width"]), round(size["height"] if height is None else height)), Image.Resampling.NEAREST)

    def place(sprite_id: str, position: tuple, height: int | None = None) -> None:
        image = sized(sprite_id, height)
        top_left = sprite_top_left(position, image.size, by_id[sprite_id]["pivot"])
        scene.alpha_composite(image, tuple(round(value) for value in top_left))

    sky_height = round(by_id["background.sky"]["displaySize"]["height"])
    for sprite_id, y in [("background.sky", ground_top - sky_height), ("background.land", ground_top)]:
        tile = sized(sprite_id)
        for x in range(0, scene.width, tile.width):
            place(sprite_id, (x + tile.width / 2, y + tile.height / 2))
    head_height = config["pipes"]["headHeight"]
    for center_x, center_y in [(600, 300), (865, 350)]:
        gap_top = center_y - config["pipes"]["gapHeight"] // 2
        gap_bottom = center_y + config["pipes"]["gapHeight"] // 2
        upper_height = gap_top - head_height
        lower_height = ground_top - gap_bottom - head_height
        place("pipe.upper.body", (center_x, upper_height / 2), upper_height)
        place("pipe.upper.head", (center_x, upper_height + head_height / 2))
        place("pipe.lower.head", (center_x, gap_bottom + head_height / 2))
        place("pipe.lower.body", (center_x, ground_top - lower_height / 2), lower_height)
    place("bird.frame1", (config["bird"]["x"], 300))
    ImageDraw.Draw(scene).text((scene.width // 2 - 16, 120), "0", fill="white", stroke_width=2, stroke_fill="#333333", font_size=60)
    return {"preview.png": sheet, "layout-preview.png": scene.convert("RGB")}


def build_assets() -> dict[str, bytes]:
    provenance = json.loads((SOURCE / "provenance.json").read_text(encoding="utf-8"))
    for record in provenance["files"]:
        actual = hashlib.sha256((SOURCE / record["file"]).read_bytes()).hexdigest()
        if actual != record["sha256"]:
            raise ValueError(f"Source snapshot changed: {record['file']}")
    package = read_package()
    with Image.open(SOURCE / "birds.1.ppm") as rgb, Image.open(SOURCE / "birds.1.pgm") as alpha:
        atlas = straight_alpha(rgb, alpha)
    files = {"birds-atlas.png": png_bytes(atlas)}
    definitions = [
        ("bird.frame1", "bird-01.png", "bird-01.png", "bird"),
        ("bird.frame2", "bird-02.png", "bird-02.png", "bird"),
        ("bird.frame3", "bird-03.png", "bird-03.png", "bird"),
        ("background.sky", "sky.png", "sky.png", "sky_bg"),
        ("background.land", "land.png", "land.png", "land_bg"),
        ("pipe.upper.head", "pipedown_header", "pipe-upper-head.png", None),
        ("pipe.upper.body", "pipedown_tail", "pipe-upper-body.png", None),
        ("pipe.lower.head", "pipeup_header", "pipe-lower-head.png", None),
        ("pipe.lower.body", "pipeup_tail", "pipe-lower-body.png", None),
    ]
    sprites, images = [], {}
    for sprite_id, export, filename, animation in definitions:
        image, metadata = upright_sprite(atlas, package[export][1])
        scale = 1 if animation is None else package[animation][1][1][1]["mat"][1] / MATRIX_SCALE
        bounds = metadata["sourceScreenBounds"]
        sprite = {
            "id": sprite_id, "file": filename, "sourceExport": export,
            **metadata,
            "displaySize": {"width": (bounds["right"] - bounds["left"]) * scale, "height": (bounds["bottom"] - bounds["top"]) * scale},
            "pivot": {"x": 0.5, "y": 0.5},
            "sizing": {"mode": "fixed"},
        }
        if sprite_id.endswith(".body"):
            sprite["referenceSize"] = dict(sprite["displaySize"])
            sprite["displaySize"]["height"] = None
            sprite["sizing"] = {"mode": "stretchBetweenBoundaries", "axis": "y"}
        files[f"runtime/{filename}"] = png_bytes(image)
        sprites.append(sprite)
        images[sprite_id] = image
    metadata = {
        "schemaVersion": 1,
        "alphaMode": "straight",
        "filter": "nearest",
        "mipmaps": False,
        "sourceUnits": {"screenScale": SCREEN_SCALE, "matrixScale": MATRIX_SCALE},
        "sourceAtlasSize": {"width": atlas.width, "height": atlas.height},
        "sprites": sprites,
        "animations": {"bird.flap": {"frames": ["bird.frame1", "bird.frame2", "bird.frame3", "bird.frame2"], "ticksPerFrame": 3, "loop": True}},
        "placement": {"positionIs": "pivotInLogicalCoordinates", "topLeftToPivot": "position = topLeft + displaySize * pivot", "horizontalTileStep": "displayWidth"},
    }
    files["runtime/sprites.json"] = (json.dumps(metadata, ensure_ascii=False, indent=2) + "\n").encode("utf-8")
    files.update({name: png_bytes(image) for name, image in draw_previews(images, sprites).items()})
    return files


def prepare(output: Path) -> None:
    for name, data in build_assets().items():
        path = output / name
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(data)
    print(f"Prepared 9 sprites, RGBA atlas and two previews in {output}")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=Path, default=ROOT / "shared/assets")
    args = parser.parse_args()
    prepare(args.output.resolve())
