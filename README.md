# Antikythera Mechanism — the Movie

An interactive, in-browser realisation of the Antikythera mechanism, driven by
[`antikythera-spectral`](https://pypi.org/project/antikythera-spectral/) running in
Pyodide. Five live viewports, ten research panels, ~10,000 years of JD scrubbing,
and no kernel data required — the engine is pure modular arithmetic over the
mechanism's encoded period relations.

▸ **Live site:** <https://lemonforest.github.io/antikythera-mechanism-the-movie/>

## Why it's neat

Plug a date into the scrubber, and you get a moon phase that's accurate to about
the right day, eclipses keyed to actual Saros offsets, parallel readouts in
Gregorian / Julian / Athenian / Olympiad calendars, and dial residues for all
thirteen of the mechanism's encoded cycles — none of which require an ephemeris.
The `antikythera-spectral` package (v0.2.0+) treats kernel data as
*validation-only*: real cross-checks against DE441 are done in the package's
test suite, but the device's own predictions come from the same modular
arithmetic the bronze gears would have computed in 200 BCE.

So this site loads Pyodide once (~6 MB, cached), pip-installs the package
(~200 KB wheel), and from then on every dial readout you see is what the
mechanism *itself* would compute, all the way out to 5000 CE.

## Why it's also phase-space geometry and dynamical systems

The mechanism's state is an N-tuple of dial angles — one per independent
cycle — so its phase space is literally a torus *T*<sup>N</sup>. A crank turn
is a translation on that torus, and the gear ratios fix the integer lattice
*Z*<sup>N</sup> → *R*<sup>N</sup> that the mechanism's discrete-time flow
lives on. The package's hypothesis battery operationalises that view:

- **B-H1** "Every cycle is an element of *C*[Z/D<sub>Ant</sub>Z] for some
  *D*<sub>Ant</sub>" — the toroidal coordinate ring
- **B-H2** "Crank-turn = single generator σ<sub>day</sub> of Z/DZ (a unit)" —
  the day-tick is a unit-element generator of the lattice
- **C-H2** "Aliasing horizon = spiral-dial return-to-start (torus-fold)" —
  Poincaré-recurrence on the spiral dials
- **D-H2** "All non-pin-and-slot gear trains are T-symmetric" — time-reversal
  structure of the flow

The site exposes that geometry directly:

- The `STATE` dock tab is a tabular live view of the toroidal coordinates
  (residue · modulus · angle · cycle-period for all 13 dials).
- The **Metonic 235-cell** and **Saros 223-cell** spiral viewports literally
  unfold the torus over time — Archimedean spirals where cell index = phase
  position in the cycle.
- The **continuous ↔ intermittent** regime toggle in the rail surfaces a
  dissipative-vs-stable distinction: continuous operation accumulates
  ~13°/19yr drift (G-H1a, FAIL), intermittent re-zeroing at calendar anchors
  bounds the drift (G-H1b, PASS) — the operator is a discrete-time feedback
  controller stabilising the orbit on the lattice.
- The **uniform / epicycle / equant** orrery toggle walks through three
  reductions of planetary dynamics, with characteristic peak errors of
  180° / 51° / 49° — three Greek toy models compared against modern truth.
- The `ECLIPSES` panel surfaces Saros offsets and anchor labels — quasi-
  periodic recurrence in discrete time, visible as the spiral wrapping.

The JD scrubber in the rail reflects this geometry too. It's deliberately
*not* a 1D tape across all of time — that would make a scalar the object
of attention and treat the JD as if it were the mechanism's real coordinate.
Instead it's a small floating window (±20 yr) around your current focus,
sliding along as you advance via the step buttons or year-jump. Because
the mechanism is HDC — its true state is the torus residue, not the
JD — **a scalar can't break our HDC object.** The math is modular and
closed-form, so the device produces well-defined output for any JD you
throw at it; the slider is just a viewport into the flow, not a position
on a tape. Practical consequence: warp the scrubber to year 50000 CE or
100000 BCE and the dials still rotate correctly. Calendar and
eclipse-search panels degrade gracefully past their internal year limits,
but `STATE` and the dial visuals don't care — they're operating on the
mechanism's own coordinates, not on the scalar.

So `phase-space-geometry` and `dynamical-systems` aren't strapped-on tags:
the mechanism is a discrete dynamical system on a torus, the package
treats it as one, and this site is the interactive viewport into both
that fact and its consequences.

## What's in it

Five viewports, in a 2×2 + bottom-row layout (each maximisable; the bottom
row collapsible):

- **Front Dial · Cosmos** — concentric Egyptian / zodiac / planet rings + half-silvered moon
- **Back Dial · Spirals** — Metonic 235-cell spiral, Saros 223-cell spiral, sub-dials
- **Sky · 35.86°N** — stereographic projection from Antikythera island
- **Orrery · Geocentric** — Hipparchian deferent + epicycle traces; toggle uniform / epicycle / equant
- **Gear DAG · Periphery Rule** — layered crank → trunk bridges → leaves; arch-mode toggles

Ten research surfaces in the bottom dock (drag the top edge to resize):

`STATE` · `ECLIPSES` · `RECON` · `EPHEM` · `HYPOTH` · `OPERATOR` · `ARCH` · `PAIRED` · `SEASONAL` · `PARETO`

Plus a left-rail time control with play/pause, ±day/month/year/Metonic/Saros
step buttons, JD scrubber spanning 5000 BCE → 5000 CE, operation regime
(continuous / intermittent), and reconstruction column (Freeth 2021 / Wright /
Price 1974 / compare).

Keyboard: `←/→` ±1 d, `[ ]` ±1 mo, `{ }` ±1 yr, `Space` play, `1`–`5` focus
viewport, `C/S/M` toggle clutch / setting / missing, `R` reset, `H` help, `O`
operator panel.

URL hash carries every piece of state — every view is shareable.

## Run locally

```sh
git clone https://github.com/lemonforest/antikythera-mechanism-the-movie
cd antikythera-mechanism-the-movie
python scripts/serve.py 8765
```

Open <http://localhost:8765/>. The dev server is a tiny wrapper around
`http.server` that pins correct MIME types — Python's stdlib serves `.js` as
`text/plain` on Windows, which silently kills `<script type="module">`. The
wrapper fixes that.

You don't need Python locally to *use* the site (Pyodide handles all of it in
the browser); the local server is only there because ES modules can't be loaded
from `file://`.

To regenerate the boot-cache snapshot (a small ~15 KB cache of the hypothesis
battery for instant first paint):

```sh
python -m pip install antikythera-spectral
python scripts/bake-boot-cache.py
```

## How it works

```
┌───────────────────┐    ┌──────────────────┐    ┌──────────────────────┐
│ index.html / css  │    │ js/state.js      │    │ data/boot-cache.json │
│ js/app.js         │◄──►│ pub/sub state    │    │ ~15 KB battery       │
│ 5 viewports       │    │ URL-hash sync    │    └──────────────────────┘
│ 10 panels         │    │ play loop        │              ▲
│ 3 HUD modules     │    └──────────────────┘              │
└─────────┬─────────┘             ▲                        │
          │                       │                        │
          │      ┌────────────────┴────────────────────────┴─────┐
          └─────►│ js/bridge.js                                   │
                 │  - loads Pyodide from cdn.jsdelivr.net          │
                 │  - micropip-installs antikythera-spectral wheel │
                 │  - proxies dial-state / calendars / eclipses /  │
                 │    visibility / battery / paired-chains         │
                 │  - synthetic stand-ins for kernel-only paths    │
                 │    (compare_ephemerides, compare_models)        │
                 └────────────────────────────────────────────────┘
```

The package version is pinned in [`js/bridge.js`](js/bridge.js) (search
`PKG_VERSION`). A scheduled GitHub Action checks PyPI weekly and opens an
auto-bump PR when a newer release is available.

## Acknowledgments

- [`antikythera-spectral`](https://github.com/lemonforest/mlehaptics/tree/main/docs/antikythera-maths/antikythera-spectral/python)
  — the engine that does all the actual mechanism math
- The [research notebook](https://github.com/lemonforest/mlehaptics/blob/main/docs/antikythera-maths/antikythera_spectral_research_notebook.md)
  drives the 31-row hypothesis battery
- [Freeth et al. 2021 (Nature)](https://www.nature.com/articles/s41598-021-84310-w)
  — the Cosmos planetarium reconstruction
- Visual language extends
  [chess-maths-the-movie](https://github.com/lemonforest/chess-maths-the-movie)
  — palette, topbar, dock, info-grid, mono readouts

## License

This repo is in the public domain ([Unlicense](LICENSE)). The
`antikythera-spectral` package is GPL-3; we use it via PyPI at runtime in the
user's browser and don't redistribute its source, so the GPL-3 governs the
package itself, not this site.
