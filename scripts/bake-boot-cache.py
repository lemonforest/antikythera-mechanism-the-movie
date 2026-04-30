#!/usr/bin/env python3
"""Bake a small boot-time cache so the HYPOTH dock tab can paint instantly
while Pyodide spins up in the browser (~10-30 s cold start).

This is NOT a fallback ephemeris — the package's modular-arithmetic
machinery doesn't need one. The hypothesis_battery is a one-shot snapshot
of static-ish package output that's worth showing immediately rather than
waiting for the runtime to boot.

Run locally; the produced file goes into data/ and is committed.

  python scripts/bake-boot-cache.py
"""
from __future__ import annotations

import json
import sys
import time
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
OUT_PATH  = REPO_ROOT / "data" / "boot-cache.json"


def bake() -> None:
    try:
        from antikythera_spectral import bridge as b
        import antikythera_spectral as a_pkg
    except Exception as e:
        sys.exit(f"FATAL: cannot import antikythera_spectral.bridge ({e})")

    try:
        battery = b.run_hypothesis_battery()
    except Exception as e:
        sys.exit(f"FATAL: run_hypothesis_battery() failed: {e}")

    payload = {
        "generated_at": int(time.time()),
        "package_version": getattr(a_pkg, "__version__", "unknown"),
        "hypothesis_battery": battery,
        "notes": "Boot cache: shown instantly while Pyodide loads. Live mode replaces this on bridge.boot() resolve.",
    }

    OUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    OUT_PATH.write_text(json.dumps(payload, separators=(",", ":")), encoding="utf-8")
    size_kb = OUT_PATH.stat().st_size / 1024
    print(f"baked boot cache -> {OUT_PATH.relative_to(REPO_ROOT)} ({size_kb:.1f} KB)")


if __name__ == "__main__":
    bake()
