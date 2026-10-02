"""Check reproducible assets, sprite geometry and gameplay asset references."""

import hashlib
import json
from pathlib import Path

from PIL import Image

from prepare_assets import ROOT, SOURCE, build_assets, sprite_top_left


def check(condition: bool, message: str) -> None:
    if not condition:
        raise ValueError(message)


def load(path: Path) -> dict:
    return json.loads(path.read_text(encoding="utf-8"))


def verify_assets() -> None:
    assets = ROOT / "shared/assets"
    provenance = load(SOURCE / "provenance.json")
    source_before = {record["file"]: hashlib.sha256((SOURCE / record["file"]).read_bytes()).hexdigest() for record in provenance["files"]}
    check(all(source_before[r["file"]] == r["sha256"] for r in provenance["files"]), "Source hash mismatch")
    metadata = load(assets / "runtime/sprites.json")
    check(metadata["alphaMode"] == "straight", "Runtime must use straight alpha")
    sprites = {record["id"]: record for record in metadata["sprites"]}
    check(len(sprites) == len(metadata["sprites"]) == 9, "Expected nine unique runtime sprites")
    config = load(ROOT / "shared/config/gameplay.json")
    references = [config["ground"]["spriteId"], config["sky"]["spriteId"]] + [
        config["pipes"][key] for key in ["upperHeadSpriteId", "upperBodySpriteId", "lowerHeadSpriteId", "lowerBodySpriteId"]
    ]
    check(set(references) <= sprites.keys(), "Config references a missing sprite")
    for record in sprites.values():
        with Image.open(assets / "runtime" / record["file"]) as sprite:
            check(sprite.mode == "RGBA", f"Not RGBA: {record['id']}")
            check(sprite.size == (record["pixelSize"]["width"], record["pixelSize"]["height"]), f"Size mismatch: {record['id']}")
        if record["id"].endswith(".body"):
            check(record["displaySize"]["height"] is None and record["sizing"] == {"mode": "stretchBetweenBoundaries", "axis": "y"}, "Body must require an explicit boundary-derived height")
            check(record["referenceSize"] == {"width": 75, "height": 250}, "Body source reference size changed")
        else:
            check(record["sizing"] == {"mode": "fixed"}, "Unexpected fixed sprite sizing")
    check(sprites["bird.frame1"]["displaySize"] == {"width": 85, "height": 60}, "Bird fixed-point scale changed")
    check(sprites["background.land"]["displaySize"] == {"width": 672, "height": 224}, "Land scale changed")
    for sprite_id in ["pipe.lower.head", "pipe.lower.body"]:
        check(sprites[sprite_id]["orientation"] == "rotate90ccw", "Lower pipe rotation missing")
    with Image.open(SOURCE / "birds.1.pgm") as alpha, Image.open(assets / "birds-atlas.png") as atlas:
        check(alpha.tobytes() == atlas.getchannel("A").tobytes(), "Atlas alpha changed during conversion")
    check(metadata["placement"]["positionIs"] == "pivotInLogicalCoordinates", "Sprite positions must represent their pivots")
    for case in load(ROOT / "shared/fixtures/resource-layout.json")["cases"]:
        record = sprites[case["spriteId"]]
        size = record["displaySize"]
        if record["sizing"]["mode"] == "stretchBetweenBoundaries":
            top, bottom = case["verticalBounds"]
            actual_size = (size["width"], bottom - top)
            check(case["position"][1] == (top + bottom) / 2, "Dynamic body's pivot must sit between its boundaries")
        else:
            actual_size = (size["width"], size["height"])
        check(list(actual_size) == case["expectedSize"], "Layout display size changed")
        actual_top_left = sprite_top_left(case["position"], actual_size, record["pivot"])
        check(list(actual_top_left) == case["expectedTopLeft"], "Layout pivot would shift the sprite")
    rebuilt = build_assets()
    check(len(rebuilt) == 13, "Expected thirteen generated outputs")
    for relative, data in rebuilt.items():
        check((assets / relative).read_bytes() == data, f"Non-reproducible output: {relative}")
    check(all(hashlib.sha256((SOURCE / name).read_bytes()).hexdigest() == value for name, value in source_before.items()), "Conversion changed the source snapshot")
    print("Assets: hashes, alpha, nine sprites, boundary sizing, pivot placement and thirteen in-memory reproducible outputs passed.")


if __name__ == "__main__":
    verify_assets()
