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

babylonjs:
    bun run --cwd babylonjs dev

check-babylonjs:
    bun run --cwd babylonjs test
    bun run --cwd babylonjs build

preview-babylonjs:
    bun run --cwd babylonjs preview

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

godot:
    bun godot/tools/project.ts play

editor-godot:
    bun godot/tools/project.ts editor

assets-godot:
    bun godot/tools/project.ts prepare

check-godot:
    bun godot/tools/project.ts check

export-godot:
    bun godot/tools/project.ts export
unity:
    bun u3d/tools/project.ts play

editor-unity:
    bun u3d/tools/project.ts editor

assets-unity:
    bun u3d/tools/project.ts prepare

check-unity:
    bun u3d/tools/project.ts check

export-unity:
    bun u3d/tools/project.ts export

build-unity-web:
    bun u3d/tools/project.ts web

preview-unity-web:
    bun u3d/tools/serve-web.ts
