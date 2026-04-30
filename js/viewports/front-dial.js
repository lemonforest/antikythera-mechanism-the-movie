/* ------------------------------------------------------------------------- *
 * viewports/front-dial.js — Cosmos Planetarium (phase-3 stub).
 *
 * Concentric rings: outer Egyptian calendar, inner zodiac (12 × 30°), planet
 * pointers (Mercury, Venus, Sun, Mars, Jupiter, Saturn) and the half-silvered
 * Moon ball. Driven by bridge.dialState(jd).
 *
 * Phase-1 stub renders rings + body pointers without parapegma plates,
 * detailed glyphs, or click-through. Hover support is wired in phase 3.
 * ------------------------------------------------------------------------- */

const SIGN_NAMES = ["Ari","Tau","Gem","Cnc","Leo","Vir","Lib","Sco","Sgr","Cap","Aqr","Psc"];
const PLANET_ORDER = ["mercury","venus","sun","mars","jupiter","saturn"];
const PLANET_GLYPH = { mercury: "☿", venus: "♀", sun: "☉", mars: "♂", jupiter: "♃", saturn: "♄", moon: "☾" };

const SIZE = 600;          // viewBox; scales to container
const CX = SIZE / 2, CY = SIZE / 2;
const R_EGYPT_OUTER = 290;
const R_EGYPT_INNER = 250;
const R_ZODIAC_OUTER = 248;
const R_ZODIAC_INNER = 210;
const R_MOON = 90;
const PLANET_RADII = { mercury: 110, venus: 130, sun: 155, mars: 175, jupiter: 195, saturn: 215 };

export function mountFrontDial(host, state, onChange, bridge) {
  if (!host) return;
  const svg = createSvg();
  host.appendChild(svg);

  const readout = document.querySelector('.panel-header [data-vp="front"]');

  drawStaticRings(svg);
  const pointersGroup = childG(svg, "pointers");
  const moonGroup = childG(svg, "moon");
  const labelGroup = childG(svg, "labels");

  let inflightJd = null;

  async function refresh(s) {
    inflightJd = s.jd;
    let dial;
    try { dial = await bridge.dialState(s.jd); }
    catch (e) { console.error("dialState", e); return; }
    if (inflightJd !== s.jd) return;
    drawPointers(pointersGroup, dial);
    drawMoon(moonGroup, dial);
    drawLabels(labelGroup, dial);
    if (readout) readout.textContent = formatReadout(dial);
  }

  refresh(state);
  onChange(refresh);
}

/* ---- helpers ---------------------------------------------------------- */

function createSvg() {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", `0 0 ${SIZE} ${SIZE}`);
  svg.setAttribute("preserveAspectRatio", "xMidYMid meet");
  svg.setAttribute("class", "front-dial-svg");
  return svg;
}

function childG(parent, id) {
  const g = document.createElementNS("http://www.w3.org/2000/svg", "g");
  g.setAttribute("class", id);
  parent.appendChild(g);
  return g;
}

function pol(rDeg, r) {
  const rad = (rDeg - 90) * Math.PI / 180;
  return { x: CX + r * Math.cos(rad), y: CY + r * Math.sin(rad) };
}

function drawStaticRings(svg) {
  const NS = "http://www.w3.org/2000/svg";

  // Outer bronze panel + inner papyrus disk.
  const panel = document.createElementNS(NS, "circle");
  panel.setAttribute("cx", CX); panel.setAttribute("cy", CY);
  panel.setAttribute("r", R_EGYPT_OUTER);
  panel.setAttribute("fill", "var(--bronze-d)");
  panel.setAttribute("stroke", "var(--bronze)");
  panel.setAttribute("stroke-width", "2");
  svg.appendChild(panel);

  const inner = document.createElementNS(NS, "circle");
  inner.setAttribute("cx", CX); inner.setAttribute("cy", CY);
  inner.setAttribute("r", R_ZODIAC_INNER);
  inner.setAttribute("fill", "rgba(216, 200, 154, 0.06)");
  inner.setAttribute("stroke", "var(--bronze)");
  inner.setAttribute("stroke-width", "1");
  svg.appendChild(inner);

  // Egyptian calendar: 365 day ticks (12 × 30 + 5 epagomenal).
  const eg = childG(svg, "egyptian-ticks");
  for (let d = 0; d < 365; d++) {
    const angle = d / 365 * 360;
    const isMonthStart = d % 30 === 0;
    const a = pol(angle, R_EGYPT_INNER);
    const b = pol(angle, isMonthStart ? R_EGYPT_OUTER : R_EGYPT_OUTER - 8);
    const ln = document.createElementNS(NS, "line");
    ln.setAttribute("x1", a.x); ln.setAttribute("y1", a.y);
    ln.setAttribute("x2", b.x); ln.setAttribute("y2", b.y);
    ln.setAttribute("stroke", "var(--papyrus)");
    ln.setAttribute("stroke-opacity", isMonthStart ? "0.8" : "0.25");
    ln.setAttribute("stroke-width", isMonthStart ? "1.3" : "0.6");
    eg.appendChild(ln);
  }

  // Zodiac: 12 signs, 30° each.
  const zod = childG(svg, "zodiac");
  for (let i = 0; i < 12; i++) {
    const startAngle = i * 30;
    // sector boundary
    const a = pol(startAngle, R_ZODIAC_INNER);
    const b = pol(startAngle, R_ZODIAC_OUTER);
    const ln = document.createElementNS(NS, "line");
    ln.setAttribute("x1", a.x); ln.setAttribute("y1", a.y);
    ln.setAttribute("x2", b.x); ln.setAttribute("y2", b.y);
    ln.setAttribute("stroke", "var(--accent)");
    ln.setAttribute("stroke-opacity", "0.4");
    ln.setAttribute("stroke-width", "1");
    zod.appendChild(ln);

    // sign label at midpoint
    const labelPos = pol(startAngle + 15, (R_ZODIAC_INNER + R_ZODIAC_OUTER) / 2);
    const text = document.createElementNS(NS, "text");
    text.setAttribute("x", labelPos.x);
    text.setAttribute("y", labelPos.y);
    text.setAttribute("text-anchor", "middle");
    text.setAttribute("dominant-baseline", "central");
    text.setAttribute("font-family", "JetBrains Mono, monospace");
    text.setAttribute("font-size", "11");
    text.setAttribute("fill", "var(--accent)");
    text.setAttribute("opacity", "0.85");
    text.textContent = SIGN_NAMES[i];
    zod.appendChild(text);
  }

  // Centre dot.
  const center = document.createElementNS(NS, "circle");
  center.setAttribute("cx", CX); center.setAttribute("cy", CY);
  center.setAttribute("r", 4);
  center.setAttribute("fill", "var(--accent)");
  svg.appendChild(center);
}

function drawPointers(g, dial) {
  const NS = "http://www.w3.org/2000/svg";
  g.innerHTML = "";
  if (!dial?.bodies) return;
  for (const name of PLANET_ORDER) {
    const body = dial.bodies[name];
    if (!body) continue;
    const r = PLANET_RADII[name];
    const pos = pol(body.lonDeg, r);

    // Pointer line
    const c0 = pol(body.lonDeg, 30);
    const ln = document.createElementNS(NS, "line");
    ln.setAttribute("x1", c0.x); ln.setAttribute("y1", c0.y);
    ln.setAttribute("x2", pos.x); ln.setAttribute("y2", pos.y);
    ln.setAttribute("stroke", `var(--body-${name})`);
    ln.setAttribute("stroke-opacity", "0.45");
    ln.setAttribute("stroke-width", "1");
    g.appendChild(ln);

    // Pointer head
    const dot = document.createElementNS(NS, "circle");
    dot.setAttribute("cx", pos.x); dot.setAttribute("cy", pos.y);
    dot.setAttribute("r", name === "sun" ? 8 : 5);
    dot.setAttribute("fill", `var(--body-${name})`);
    dot.setAttribute("stroke", "var(--bg-0)");
    dot.setAttribute("stroke-width", "1.5");
    g.appendChild(dot);

    // Glyph
    const text = document.createElementNS(NS, "text");
    text.setAttribute("x", pos.x);
    text.setAttribute("y", pos.y - 12);
    text.setAttribute("text-anchor", "middle");
    text.setAttribute("font-family", "JetBrains Mono, monospace");
    text.setAttribute("font-size", "12");
    text.setAttribute("fill", `var(--body-${name})`);
    text.textContent = PLANET_GLYPH[name] || name[0].toUpperCase();
    g.appendChild(text);
  }
}

function drawMoon(g, dial) {
  const NS = "http://www.w3.org/2000/svg";
  g.innerHTML = "";
  const moon = dial?.bodies?.moon;
  if (!moon) return;
  const pos = pol(moon.lonDeg, R_MOON);

  // Background dark side
  const dark = document.createElementNS(NS, "circle");
  dark.setAttribute("cx", pos.x); dark.setAttribute("cy", pos.y);
  dark.setAttribute("r", 10);
  dark.setAttribute("fill", "var(--bg-3)");
  dark.setAttribute("stroke", "var(--body-moon)");
  dark.setAttribute("stroke-width", "1");
  g.appendChild(dark);

  // Illuminated half (clipped wedge approximation: sized by illuminatedFrac)
  const frac = moon.illuminatedFrac ?? 0.5;
  const lit = document.createElementNS(NS, "circle");
  lit.setAttribute("cx", pos.x); lit.setAttribute("cy", pos.y);
  lit.setAttribute("r", 10 * Math.sqrt(frac));
  lit.setAttribute("fill", "var(--body-moon)");
  g.appendChild(lit);
}

function drawLabels(g, dial) {
  const NS = "http://www.w3.org/2000/svg";
  g.innerHTML = "";
  const text = document.createElementNS(NS, "text");
  text.setAttribute("x", CX);
  text.setAttribute("y", CY + 30);
  text.setAttribute("text-anchor", "middle");
  text.setAttribute("font-family", "JetBrains Mono, monospace");
  text.setAttribute("font-size", "9");
  text.setAttribute("fill", "var(--fg-3)");
  text.textContent = `JD ${(dial?.jd ?? 0).toFixed(0)} · ${dial?._mock ? "demo" : "live"}`;
  g.appendChild(text);
}

function formatReadout(dial) {
  if (!dial?.bodies) return "—";
  const sun = dial.bodies.sun;
  if (!sun) return "—";
  return `Sun ${sun.sign} ${sun.signDeg.toFixed(1)}°`;
}
