import copy
import json
import sys
import unittest
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import verify_m1


class ReviewContractTests(unittest.TestCase):
    def test_reviewed_fields_cannot_be_changed_without_detection(self):
        files = {
            "gameplay.json": verify_m1.ROOT / "shared/config/gameplay.json",
            "gameplay-cases.json": verify_m1.ROOT / "shared/fixtures/gameplay-cases.json",
            "replay-baseline.json": verify_m1.ROOT / "shared/fixtures/replay-baseline.json",
            "lifecycle-cases.json": verify_m1.ROOT / "shared/fixtures/lifecycle-cases.json",
        }
        originals = {name: json.loads(path.read_text()) for name, path in files.items()}
        changes = [
            ("replay-baseline.json", ("snapshots", 1, "state"), "ready"),
            ("replay-baseline.json", ("snapshots", 1, "velocityY"), 99),
            ("replay-baseline.json", ("snapshots", 2, "score"), 0),
            ("replay-baseline.json", ("expected", "deathReason"), "ground"),
            ("replay-baseline.json", ("expected", "ignoredFlapTicks"), []),
            ("gameplay-cases.json", ("trajectory", "flapTicks"), [2]),
            ("gameplay-cases.json", ("trajectory", "expected", "deathTick"), 24),
            ("gameplay.json", ("bird", "hitbox", "offsetX"), 10),
            ("gameplay.json", ("bird", "hitbox", "offsetY"), 10),
            ("gameplay.json", ("rules", "collisionBeforeScore"), False),
            ("gameplay-cases.json", ("stepCases", 0, "snapshots", 0, "state"), "dying"),
            ("gameplay-cases.json", ("recycle", "snapshots", 1, "consumedGapCenters"), 7),
            ("lifecycle-cases.json", ("steps", 3, "expected", "paused"), False),
            ("gameplay.json", ("simulation", "maxCatchUpTicks"), 6),
        ]
        for filename, keys, replacement in changes:
            with self.subTest(filename=filename, field=keys):
                data = copy.deepcopy(originals)
                target = data[filename]
                for key in keys[:-1]:
                    target = target[key]
                target[keys[-1]] = replacement

                def load(path):
                    return data[path.name] if path.name in data else json.loads(path.read_text())

                with patch.object(verify_m1, "load", side_effect=load):
                    with self.assertRaises(ValueError):
                        verify_m1.verify_contract()

    def test_asset_verification_needs_no_scratch_directory(self):
        with patch("tempfile.mkdtemp", side_effect=AssertionError("No scratch directory expected")):
            with patch.object(Path, "mkdir", side_effect=AssertionError("Verification must not create directories")):
                with patch.object(Path, "write_bytes", side_effect=AssertionError("Verification must not write generated files")):
                    verify_m1.verify_assets()


if __name__ == "__main__":
    unittest.main()
