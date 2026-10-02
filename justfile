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
