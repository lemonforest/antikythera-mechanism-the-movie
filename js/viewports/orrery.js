/* ------------------------------------------------------------------------- *
 * viewports/orrery.js — geocentric epicycle orrery (phase-7 stub).
 *
 * Earth at the center. Each planet rides a deferent + epicycle (Hipparchian).
 * Sun and Moon get simple circular orbits. The three Greek-model toggles
 * (uniform / epicycle / equant) live in the panel header.
 *
 * Phase-1 stub draws deferents + planet positions from bridge.dialState
 * body longitudes. Real epicycle math + DE441 ghost arrive in phase 7.
 * ------------------------------------------------------------------------- */

const SIZE = 600;
const CX = SIZE / 2, CY = SIZE / 2;

// Geocentric "deferent" radii (logarithmic-ish for visual clarity).
const ORBIT_R = {
  moon:    50,
  mercury: 90,
  venus:   125,
  sun:     160,
  mars:    195,
  jupiter: 230,
  saturn:  265,
};
const PLANET_GLYPH = { mercury: "☿", venus: "♀", sun: "☉", mars: "♂", jupiter: "♃", saturn: "♄", moon: "☾" };

export function mountOrrery(host, state, onChange, bridge) {
  if (!host) return;
  const NS = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(NS, "svg");
  svg.setAttribute("viewBox", `0 0 ${SIZE} ${SIZE}`);
  svg.setAttribute("preserveAspectRatio", "xMidYMid meet");
  host.appendChild(svg);

  drawDeferents(svg);
  drawEarth(svg);
  const planetG = childG(svg, "planets");

  const readout = document.querySelector('.panel-header [data-vp="orrery"]');

  let inflightJd = null;
  async function refresh(s) {
    inflightJd = s.jd;
    let dial;
    try { dial = await bridge.dialState(s.jd); }
    catch (e) { console.error("dialState (orrery)", e); return; }
    if (inflightJd !== s.jd) return;
    drawPlanets(planetG, dial);
    if (readout) {
      const sunDeg = dial?.bodies?.sun?.lonDeg ?? 0;
      readout.textContent = `Sun ${sunDeg.toFixed(1)}° ecliptic`;
    }
  }
  refresh(state);
  onChange(refresh);
}

/* ---- drawing helpers ------------------------------------------------- */

function drawDeferents(svg) {
  const NS = "http://www.w3.org/2000/svg";
  for (const [name, r] of Object.entries(ORBIT_R)) {
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

function drawEarth(svg) {
  const NS = "http://www.w3.org/2000/svg";
  const c = document.createElementNS(NS, "circle");
  c.setAttribute("cx", CX); c.setAttribute("cy", CY);
  c.setAttribute("r", 8);
  c.setAttribute("fill", "var(--verdigris)");
  c.setAttribute("stroke", "var(--fg-1)");
  c.setAttribute("stroke-width", "1");
  svg.appendChild(c);

  const t = document.createElementNS(NS, "text");
  t.setAttribute("x", CX);
  t.setAttribute("y", CY + 22);
  t.setAttribute("text-anchor", "middle");
  t.setAttribute("font-family", "JetBrains Mono, monospace");
  t.setAttribute("font-size", "9");
  t.setAttribute("fill", "var(--fg-3)");
  t.textContent = "⊕ Earth";
  svg.appendChild(t);
}

function drawPlanets(g, dial) {
  const NS = "http://www.w3.org/2000/svg";
  g.innerHTML = "";
  if (!dial?.bodies) return;
  for (const [name, r] of Object.entries(ORBIT_R)) {
    const body = dial.bodies[name];
    if (!body) continue;
    const a = (body.lonDeg - 90) * Math.PI / 180;
    const x = CX + r * Math.cos(a);
    const y = CY + r * Math.sin(a);

    const dot = document.createElementNS(NS, "circle");
    dot.setAttribute("cx", x); dot.setAttribute("cy", y);
    dot.setAttribute("r", name === "sun" ? 7 : 5);
    dot.setAttribute("fill", `var(--body-${name})`);
    dot.setAttribute("stroke", "var(--bg-0)");
    dot.setAttribute("stroke-width", "1.5");
    g.appendChild(dot);

    const text = document.createElementNS(NS, "text");
    text.setAttribute("x", x); text.setAttribute("y", y - 11);
    text.setAttribute("text-anchor", "middle");
    text.setAttribute("font-family", "JetBrains Mono, monospace");
    text.setAttribute("font-size", "11");
    text.setAttribute("fill", `var(--body-${name})`);
    text.textContent = PLANET_GLYPH[name] || name[0].toUpperCase();
    g.appendChild(text);
  }
}

function childG(parent, id) {
  const g = document.createElementNS("http://www.w3.org/2000/svg", "g");
  g.setAttribute("class", id);
  parent.appendChild(g);
  return g;
}
