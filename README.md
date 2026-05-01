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
