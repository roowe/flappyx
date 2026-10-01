assets:
    uv run --project tools --locked python tools/prepare_assets.py

check-m1:
    uv run --project tools --locked python tools/verify_m1.py
    uv run --project tools --locked python -m unittest discover -s tools/tests -v
