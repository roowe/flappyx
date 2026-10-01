"""Check reproducible assets and execute every M1 fixture against an independent oracle."""

import hashlib
import json
import math
from fractions import Fraction
from pathlib import Path

from PIL import Image

from contract_reference import ReferenceClock, ReferenceGame, pipe_collision, score_delta, validate_rules, xorshift32
from prepare_assets import ROOT, SOURCE, build_assets, sprite_top_left


def check(condition: bool, message: str) -> None:
    if not condition:
        raise ValueError(message)


def load(path: Path) -> dict:
    return json.loads(path.read_text(encoding="utf-8"))


def match_fields(actual: dict, expected: dict, label: str, tolerance: float = 0.001) -> None:
    float_fields = {"y", "birdY", "velocityY", "firstPipeX", "pipeXs", "accumulatedTicks"}
    for key, value in expected.items():
        check(key in actual, f"{label}: unknown expected field {key}")
        observed = actual[key]
        if key in float_fields and value is not None:
            left, right = (observed, value) if isinstance(value, list) else ([observed], [value])
            equal = len(left) == len(right) and all(math.isclose(a, b, rel_tol=0, abs_tol=tolerance) for a, b in zip(left, right, strict=True))
        else:
            equal = observed == value
        check(equal, f"{label}.{key}: expected {value!r}, received {observed!r}")


def verify_assets() -> None:
    assets = ROOT / "shared/assets"
    provenance = load(SOURCE / "provenance.json")
    source_before = {record["file"]: hashlib.sha256((SOURCE / record["file"]).read_bytes()).hexdigest() for record in provenance["files"]}
    check(all(source_before[r["file"]] == r["sha256"] for r in provenance["files"]), "Source hash mismatch")
    metadata = load(assets / "runtime/sprites.json")
    check(metadata["alphaMode"] == "straight", "Runtime must use straight alpha")
    sprites = {record["id"]: record for record in metadata["sprites"]}
    check(len(sprites) == len(metadata["sprites"]) == 9, "Expected nine unique runtime sprites")
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


def verify_step_case(config: dict, case: dict) -> None:
    game = ReferenceGame(config, case["initial"], case["flapTicks"], case.get("pipeGapCenters"), case.get("pipes"))
    for snapshot in case["snapshots"]:
        while game.tick < snapshot["tick"]:
            game.step()
        match_fields(game.snapshot(), snapshot, case["id"], config["simulation"]["positionTolerance"])
    match_fields(game.result(), case["expected"], case["id"])


def verify_contract() -> None:
    config = load(ROOT / "shared/config/gameplay.json")
    cases = load(ROOT / "shared/fixtures/gameplay-cases.json")
    replay = load(ROOT / "shared/fixtures/replay-baseline.json")
    lifecycle = load(ROOT / "shared/fixtures/lifecycle-cases.json")
    check(all(data["schemaVersion"] == 1 for data in [config, cases, replay, lifecycle]), "Schema versions differ")
    validate_rules(config)
    bird, pipes, ground = config["bird"], config["pipes"], config["ground"]
    check(config["simulation"]["tickRate"] == 30, "Reference tick rate changed")
    check(ground["topY"] + ground["height"] == config["canvas"]["height"], "Ground geometry inconsistent")
    check(bird["initialY"] == ground["topY"] - bird["displayHeight"] / 2 - 50, "Initial bird altitude changed")
    check(pipes["gapCenterMin"] == pipes["gapHeight"] / 2 + pipes["headHeight"] + pipes["topClearance"], "Minimum opening inconsistent")
    check(pipes["gapCenterMax"] == ground["topY"] - pipes["gapHeight"] / 2 - pipes["headHeight"] - pipes["bottomClearance"], "Maximum opening inconsistent")
    check(pipes["gapCenterMin"] < pipes["gapCenterMax"], "No legal pipe openings")
    check(pipes["activeCount"] == math.ceil(config["canvas"]["width"] / (pipes["width"] + pipes["spacing"])) + 3, "Pipe queue capacity inconsistent")
    ids = {sprite["id"] for sprite in load(ROOT / "shared/assets/runtime/sprites.json")["sprites"]}
    references = [ground["spriteId"], config["sky"]["spriteId"]] + [pipes[key] for key in ["upperHeadSpriteId", "upperBodySpriteId", "lowerHeadSpriteId", "lowerBodySpriteId"]]
    check(set(references) <= ids, "Config references a missing sprite")

    verify_step_case(config, cases["trajectory"])
    for case in cases["stepCases"]:
        verify_step_case(config, case)
    verify_step_case(config, cases["recycle"])
    for case in cases["collisionQueries"]:
        hit = pipe_collision(config, case["birdY"], case["pipeX"], case["gapCenterY"], case.get("hitboxOffset"))
        check(case["expected"] == (hit is not None), f"Collision expectation inconsistent: {case['id']}")
    for case in cases["scoreQueries"]:
        check(case["expectedDelta"] == score_delta(config, case), f"Score expectation inconsistent: {case['id']}")
    restart = cases["restart"]
    game = ReferenceGame(config, restart["initial"], [])
    for action in restart["actions"]:
        while game.tick < action["tick"]:
            game.step()
        check(action["action"] == "restart", "Unsupported restart action")
        check(game.restart() == action["expectedAccepted"], "Restart acceptance inconsistent")
    match_fields(game.snapshot(), restart["expected"], "restart")

    value = cases["random"]["seed"]
    for expected, center in zip(cases["random"]["uint32Sequence"], cases["random"]["gapCenters"], strict=True):
        value = xorshift32(value)
        check(value == expected and center == pipes["gapCenterMin"] + value % (pipes["gapCenterMax"] - pipes["gapCenterMin"] + 1), "Random vector inconsistent")

    check(replay["renderFps"] == [30, 60, 120], "Render rate comparisons missing")
    check(all(pipes["gapCenterMin"] <= y <= pipes["gapCenterMax"] for y in replay["pipeGapCenters"]), "Replay contains an illegal opening")
    for fps in replay["renderFps"]:
        game = ReferenceGame(config, {"state": replay["initialState"], "bestScore": replay["initialBestScore"], "seed": replay["seed"]}, replay["flapTicks"], replay["pipeGapCenters"])
        clock = ReferenceClock(game)
        snapshots = {s["tick"]: s for s in replay["snapshots"]}
        seen = set()
        for _ in range(replay["totalTicks"] * fps // config["simulation"]["tickRate"]):
            clock.frame(Fraction(1000, fps))
            if game.tick in snapshots:
                match_fields(game.snapshot(), snapshots[game.tick], f"replay {fps}fps tick {game.tick}", config["simulation"]["positionTolerance"])
                seen.add(game.tick)
        check(seen == set(snapshots) and game.tick == replay["totalTicks"], "Replay did not reach every snapshot")
        match_fields({**game.snapshot(), **game.result()}, replay["expected"], f"replay {fps}fps")

    game = ReferenceGame(config, lifecycle["initial"], [], pipes=[])
    clock = ReferenceClock(game)
    for index, step in enumerate(lifecycle["steps"]):
        actual = {}
        if "event" in step:
            clock.event(step["event"])
        else:
            actual["processedTicks"] = clock.frame(step["elapsedMilliseconds"])
        actual.update(game.snapshot())
        actual.update({"paused": clock.paused, "accumulatedTicks": float(clock.accumulated)})
        match_fields(actual, step["expected"], f"lifecycle step {index}")
    print("Contract: sequential state/velocity/score/events, offsets, collision priority, restart, seven-pipe recycling, pause/catch-up and 30/60/120 FPS replay passed. Production TS/C# cores still require independent execution.")


if __name__ == "__main__":
    verify_assets()
    verify_contract()
