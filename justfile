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

cocos:
    bun run --cwd cocos/game editor

assets-cocos:
    bun run --cwd cocos/game prepare

check-m4:
    bun run --cwd cocos/game test
    bun run --cwd cocos/game typecheck:core
    bun run --cwd cocos/game build
    bun run --cwd cocos/game typecheck

preview-cocos:
    bun run --cwd cocos/game preview
