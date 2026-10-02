assets:
    uv run --project tools --locked python tools/prepare_assets.py

check-m1:
    uv run --project tools --locked python tools/verify_m1.py
    uv run --project tools --locked python -m unittest discover -s tools/tests -v

phaser:
    bun run --cwd phaser dev

check-m2:
    bun run --cwd phaser test
    bun run --cwd phaser build

preview-phaser:
    bun run --cwd phaser preview

threejs:
    bun run --cwd threejs dev

check-m3:
    bun run --cwd threejs test
    bun run --cwd threejs build

preview-threejs:
    bun run --cwd threejs preview

compare-web-frames:
    uv run --project tools --locked python tools/compare_web_frames.py
