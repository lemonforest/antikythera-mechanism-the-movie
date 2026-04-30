#!/usr/bin/env python3
"""Pre-bake an NDJSON ephemeris around the construction epoch (~205 BCE).

Used by the demo / fallback mode of js/bridge.js when Pyodide can't load.
Newline-delimited JSON: one record per line, tagged with `t` (type):

  {"t":"meta",   "dial_names": [...], "dials": {<name>: {modulus, period}, ...}, ...}
  {"t":"battery","ok": true, "rows": [...], ...}
  {"t":"sample","jd":1648070.0, "r":[res_per_dial], "a":[angle_per_dial]}
  ... (one sample line per JD step)

Streams better, gzips better, easier to inspect with `head`/`jq -c`. The JS
loader reads it with TextDecoderStream + a line-buffered split; the
hypothesis battery is materialised on first encounter and the samples land
in a flat array for binary-search lookup.

Methods that depend on kernel data (eclipses, compare_ephemerides) keep
using JS-side simplified math; not all bridge methods are covered here.

Run locally; the produced file goes into data/ and is committed.

  python scripts/bake-ephemeris.py
"""
from __future__ import annotations

import json
import sys
import time
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
OUT_PATH  = REPO_ROOT / "data" / "fallback-ephemeris.ndjson"
JD_CENTER = 1684595.0          # encoder reference epoch (~205 BCE)
JD_HALF   = 200 * 365.25       # ±200 yr — covers a Saros + plenty of room
JD_STEP   = 30.0               # sample monthly; balance accuracy and size

# Round dial residues (already int) and angles (round to 2 dp -> ~0.01 deg).
ANGLE_PRECISION = 2


def bake() -> None:
    try:
        from antikythera_spectral import bridge as b
        import antikythera_spectral as a_pkg
    except Exception as e:
        sys.exit(f"FATAL: cannot import antikythera_spectral.bridge ({e})")

    # First sample: capture dial spec + sample structure.
    first = b.get_dial_state(JD_CENTER)
    dial_names = list(first["dials"].keys())
    dials_meta = {
        name: {
            "modulus": int(first["dials"][name]["modulus"]),
            "cycle_period_days": round(first["dials"][name]["cycle_period_days"], 4),
        }
        for name in dial_names
    }

    OUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    t0 = time.time()
    n_samples_planned = int((2 * JD_HALF) / JD_STEP) + 1

    with OUT_PATH.open("w", encoding="utf-8", newline="\n") as f:
        # 1. meta line
        meta = {
            "t": "meta",
            "generated_at": int(time.time()),
            "package_version": getattr(a_pkg, "__version__", "unknown"),
            "jd_center": JD_CENTER,
            "jd_half_window": JD_HALF,
            "jd_step": JD_STEP,
            "n_samples": n_samples_planned,
            "dial_names": dial_names,
            "dials": dials_meta,
            "notes": "Streamed NDJSON; one sample per line. JS fallback binary-searches by JD.",
        }
        f.write(json.dumps(meta, separators=(",", ":"))); f.write("\n")

        # 2. hypothesis battery line (one-shot, captured once)
        try:
            battery = b.run_hypothesis_battery()
            battery["t"] = "battery"
        except Exception as e:
            battery = {"t": "battery", "ok": False, "error": str(e)}
        f.write(json.dumps(battery, separators=(",", ":"))); f.write("\n")

        # 3. sample lines
        n = 0
        jd = JD_CENTER - JD_HALF
        while jd <= JD_CENTER + JD_HALF + 1e-6:
            try:
                ds = b.get_dial_state(jd)
            except Exception as e:
                sys.exit(f"FATAL at JD {jd}: {e}")
            residues, angles = [], []
            for name in dial_names:
                d = ds["dials"][name]
                residues.append(int(d["residue"]))
                angles.append(round(float(d["angle_deg"]), ANGLE_PRECISION))
            line = {"t": "sample", "jd": round(jd, 1), "r": residues, "a": angles}
            f.write(json.dumps(line, separators=(",", ":"))); f.write("\n")
            n += 1
            jd += JD_STEP

    elapsed = time.time() - t0
    size_kb = OUT_PATH.stat().st_size / 1024
    print(f"baked {n} samples -> {OUT_PATH.relative_to(REPO_ROOT)} "
          f"({size_kb:.1f} KB) in {elapsed:.1f}s")


if __name__ == "__main__":
    bake()
