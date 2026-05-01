/* ------------------------------------------------------------------------- *
 * viewports/orrery.js — orrery with geo/helio toggle.
 *
 * GEO mode (default; what the Antikythera itself computes): Earth at center,
 * each body on its geocentric ecliptic-longitude circle. Header offers the
 * three Greek-model selectors (uniform / epicycle / equant) — those are
 * Hipparchian/Ptolemaic constructions and only meaningful in this frame.
 *
 * HELIO mode: Sun at center, planets (including Earth) on their heliocentric
 * mean-longitude circles. Moon orbits Earth wherever Earth is. The Greek-
 * model toggle is irrelevant here (no epicycles around the Sun) and is
 * effectively ignored in this frame.
 *
 * The mechanism itself is geocentric by construction; the helio view is a
 * pedagogical alternate projection of the same modular state, useful for
 * showing planets in their actual physical relationships.
 * ------------------------------------------------------------------------- */

import { setState } from "../state.js";

const SIZE = 600;
const CX = SIZE / 2, CY = SIZE / 2;

/* Geocentric (Earth at center) deferent radii. */
const GEO_ORBIT_R = {
  moon:    50,
  mercury: 90,
  venus:   125,
  sun:     160,
  mars:    195,
  jupiter: 230,
  saturn:  265,
};

/* Heliocentric (Sun at center) orbit radii. Earth replaces Sun in the
 * sequence; ordering reflects actual semi-major-axis order. */
const HELIO_ORBIT_R = {
  mercury: 60,
  venus:   100,
  earth:   140,
  mars:    180,
  jupiter: 220,
  saturn:  260,
};
const HELIO_MOON_R = 22;   // moon orbits earth in helio frame

/* Heliocentric mean motion for body-position math.
 * Earth's helio longitude ≈ Sun's apparent geocentric longitude − 180°, so
 * we just give Earth the same rate as the Sun's apparent motion with the
 * 180° offset applied at L0. */
const J2000 = 2451545.0;
const HELIO_MEAN_MOTION = {
  mercury: { rate: 4.092339,  L0: 252.2509 },
  venus:   { rate: 1.602131,  L0: 181.9798 },
  earth:   { rate: 0.985647,  L0: 100.4665 },   // = 280.4665 − 180
  mars:    { rate: 0.524033,  L0: 355.4330 },
  jupiter: { rate: 0.083091,  L0: 34.3515  },
  saturn:  { rate: 0.033494,  L0: 50.0775  },
};

const PLANET_GLYPH = {
  mercury: "☿", venus: "♀", earth: "⊕", sun: "☉",
  mars: "♂", jupiter: "♃", saturn: "♄", moon: "☾",
};

const wrap360 = (x) => ((x % 360) + 360) % 360;
function helioLon(name, jd) {
  const p = HELIO_MEAN_MOTION[name];
  return p ? wrap360(p.L0 + p.rate * (jd - J2000)) : 0;
}

export function mountOrrery(host, state, onChange, _bridge) {
  if (!host) return;
  const NS = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(NS, "svg");
  svg.setAttribute("viewBox", `0 0 ${SIZE} ${SIZE}`);
  svg.setAttribute("preserveAspectRatio", "xMidYMid meet");
  host.appendChild(svg);

  const orreryPanel = host.closest(".viewport");
  const readout     = document.querySelector('.panel-header [data-vp="orrery"]');
  const h2          = document.getElementById("orrery-h2");

  /* Wire the geo/helio frame toggle. */
  orreryPanel?.querySelectorAll("[data-orr-frame]").forEach((btn) => {
    btn.addEventListener("click", () => {
      setState({ orreryFrame: btn.dataset.orrFrame });
    });
  });

  /* The frame toggle changes the static structure (deferents / orbits + Earth
   * vs Sun at centre) so we redraw it from scratch on frame change. The body
   * positions update on every JD change. */
  let inflightJd = null;
  let lastFrame = null;

  function rebuildStaticLayer(frame) {
    while (svg.firstChild) svg.removeChild(svg.firstChild);
    if (frame === "helio") {
      drawHelioOrbits(svg);
      drawCenter(svg, "sun");
    } else {
      drawGeoDeferents(svg);
      drawCenter(svg, "earth");
    }
  }

  function paintReadout(frame, dial) {
    if (h2) h2.textContent = `ORRERY · ${frame === "helio" ? "HELIOCENTRIC" : "GEOCENTRIC"}`;
    if (!readout) return;
    if (frame === "helio") {
      const e = helioLon("earth", dial?.jd ?? 0);
      readout.textContent = `Earth ${e.toFixed(1)}° helio`;
    } else {
      const sunDeg = dial?.bodies?.sun?.lonDeg ?? 0;
      readout.textContent = `Sun ${sunDeg.toFixed(1)}° ecliptic`;
    }
  }

  function syncFrameButtons(frame) {
    orreryPanel?.querySelectorAll("[data-orr-frame]").forEach((b) => {
      const on = b.dataset.orrFrame === frame;
      b.classList.toggle("active", on);
      b.setAttribute("aria-pressed", on ? "true" : "false");
    });
  }

  async function refresh(s) {
    inflightJd = s.jd;
    let dial;
    try { dial = await _bridge.dialState(s.jd); }
    catch (e) { console.error("dialState (orrery)", e); return; }
    if (inflightJd !== s.jd) return;

    if (s.orreryFrame !== lastFrame) {
      lastFrame = s.orreryFrame;
      rebuildStaticLayer(s.orreryFrame);
      syncFrameButtons(s.orreryFrame);
    }

    /* The planet-position layer is re-created on every JD update; static
     * orbits stay in place underneath. We hold a per-frame group as a
     * sibling so it's easy to replace. */
    let planetG = svg.querySelector("g.planets");
    if (!planetG) {
      planetG = document.createElementNS(NS, "g");
      planetG.setAttribute("class", "planets");
      svg.appendChild(planetG);
    }
    if (s.orreryFrame === "helio") {
      drawHelioBodies(planetG, s.jd);
    } else {
      drawGeoBodies(planetG, dial);
    }
    paintReadout(s.orreryFrame, dial);
  }
  refresh(state);
  onChange(refresh);
}

/* ---- geocentric drawing (unchanged from phase-1 stub) -------------------- */

function drawGeoDeferents(svg) {
  const NS = "http://www.w3.org/2000/svg";
  for (const [name, r] of Object.entries(GEO_ORBIT_R)) {
    const c = document.createElementNS(NS, "circle");
    c.setAttribute("cx", CX); c.setAttribute("cy", CY);
    c.setAttribute("r", r);
    c.setAttribute("fill", "none");
    c.setAttribute("stroke", `var(--body-${name})`);
    c.setAttribute("stroke-opacity", "0.3");
    c.setAttribute("stroke-width", "1");
    c.setAttribute("stroke-dasharray", "2 5");
    svg.appendChild(c);
  }
}

function drawGeoBodies(g, dial) {
  const NS = "http://www.w3.org/2000/svg";
  g.innerHTML = "";
  if (!dial?.bodies) return;
  for (const [name, r] of Object.entries(GEO_ORBIT_R)) {
    const body = dial.bodies[name];
    if (!body) continue;
    const a = (body.lonDeg - 90) * Math.PI / 180;
    const x = CX + r * Math.cos(a);
    const y = CY + r * Math.sin(a);
    drawBody(g, x, y, name, name === "sun" ? 7 : 5);
  }
}

/* ---- heliocentric drawing ------------------------------------------------ */

function drawHelioOrbits(svg) {
  const NS = "http://www.w3.org/2000/svg";
  for (const [name, r] of Object.entries(HELIO_ORBIT_R)) {
    const c = document.createElementNS(NS, "circle");
    c.setAttribute("cx", CX); c.setAttribute("cy", CY);
    c.setAttribute("r", r);
    c.setAttribute("fill", "none");
    c.setAttribute("stroke", `var(--body-${name})`);
    c.setAttribute("stroke-opacity", "0.35");
    c.setAttribute("stroke-width", "1");
    c.setAttribute("stroke-dasharray", "2 5");
    svg.appendChild(c);
  }
}

function drawHelioBodies(g, jd) {
  const NS = "http://www.w3.org/2000/svg";
  g.innerHTML = "";
  let earthX = CX, earthY = CY;
  for (const [name, r] of Object.entries(HELIO_ORBIT_R)) {
    const lon = helioLon(name, jd);
    const a = (lon - 90) * Math.PI / 180;
    const x = CX + r * Math.cos(a);
    const y = CY + r * Math.sin(a);
    drawBody(g, x, y, name, 5);
    if (name === "earth") { earthX = x; earthY = y; }
  }
  /* Moon — orbits Earth. Phase angle from Sun-Earth-Moon geometry: moon
   * position relative to Earth tracks the synodic month; we use a simple
   * mean-motion approximation here just for visual placement. */
  const moonSynodic = 360 / 29.530589;
  const moonLon = wrap360((jd - J2000) * moonSynodic);
  const ma = (moonLon - 90) * Math.PI / 180;
  const mx = earthX + HELIO_MOON_R * Math.cos(ma);
  const my = earthY + HELIO_MOON_R * Math.sin(ma);
  drawBody(g, mx, my, "moon", 3);
}

/* ---- shared body-glyph drawing ------------------------------------------- */

function drawBody(g, x, y, name, radius) {
  const NS = "http://www.w3.org/2000/svg";
  const dot = document.createElementNS(NS, "circle");
  dot.setAttribute("cx", x); dot.setAttribute("cy", y);
  dot.setAttribute("r", radius);
  dot.setAttribute("fill", `var(--body-${name})`);
  dot.setAttribute("stroke", "var(--bg-0)");
  dot.setAttribute("stroke-width", "1.5");
  g.appendChild(dot);

  const text = document.createElementNS(NS, "text");
  text.setAttribute("x", x);
  text.setAttribute("y", y - radius - 4);
  text.setAttribute("text-anchor", "middle");
  text.setAttribute("font-family", "JetBrains Mono, monospace");
  text.setAttribute("font-size", "11");
  text.setAttribute("fill", `var(--body-${name})`);
  text.textContent = PLANET_GLYPH[name] || name[0].toUpperCase();
  g.appendChild(text);
}

function drawCenter(svg, name) {
  const NS = "http://www.w3.org/2000/svg";
  const c = document.createElementNS(NS, "circle");
  c.setAttribute("cx", CX); c.setAttribute("cy", CY);
  c.setAttribute("r", name === "sun" ? 10 : 8);
  c.setAttribute("fill", `var(--body-${name})`);
  c.setAttribute("stroke", "var(--fg-1)");
  c.setAttribute("stroke-width", "1");
  svg.appendChild(c);

  const t = document.createElementNS(NS, "text");
  t.setAttribute("x", CX);
  t.setAttribute("y", CY + (name === "sun" ? 26 : 22));
  t.setAttribute("text-anchor", "middle");
  t.setAttribute("font-family", "JetBrains Mono, monospace");
  t.setAttribute("font-size", "9");
  t.setAttribute("fill", "var(--fg-3)");
  t.textContent = name === "sun" ? "☉ Sun" : "⊕ Earth";
  svg.appendChild(t);
}
