"""记录 Phaser 与 Three.js 基准截图的像素差异，不把栅格化差异当作玩法误差。"""

import hashlib
import json
from pathlib import Path

from PIL import Image, ImageChops

ROOT = Path(__file__).resolve().parents[1]
REGION = (0, 146, 1024, 704)  # 排除 HUD 与页脚，保留鸟、管道、天空和地面。


def compare_tick(tick: int) -> dict:
    paths = [ROOT / "docs/baselines" / engine / f"tick-{tick}.png" for engine in ("phaser", "threejs")]
    images = []
    for path in paths:
        with Image.open(path) as source:
            if source.size != (1024, 768):
                raise ValueError(f"Expected logical canvas screenshot: {path}")
            images.append(source.convert("RGB").crop(REGION))
    differences = ImageChops.difference(*images).tobytes()
    pixels = len(differences) // 3
    changed = sum(differences[i:i + 3] != b"\x00\x00\x00" for i in range(0, len(differences), 3))
    return {
        "tick": tick,
        "comparedPixels": pixels,
        "differentPixels": changed,
        "differentFraction": changed / pixels,
        "meanAbsoluteChannelDifference": sum(differences) / len(differences),
        "maximumChannelDifference": max(differences),
        "imageSha256": {engine: hashlib.sha256(path.read_bytes()).hexdigest()
                        for engine, path in zip(("phaser", "threejs"), paths)},
    }


if __name__ == "__main__":
    report = {
        "schemaVersion": 1,
        "configSha256": hashlib.sha256((ROOT / "shared/config/gameplay.json").read_bytes()).hexdigest(),
        "region": list(REGION),
        "frames": [compare_tick(tick) for tick in (118, 134, 141)],
    }
    output = ROOT / "docs/baselines/threejs/screenshot-comparison.json"
    output.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    for frame in report["frames"]:
        print(f"tick {frame['tick']}: {frame['differentPixels']} different pixels, "
              f"mean channel difference {frame['meanAbsoluteChannelDifference']:.4f}")
    print(f"Evidence: {output}")
