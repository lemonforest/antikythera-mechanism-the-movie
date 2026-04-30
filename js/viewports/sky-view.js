/* ------------------------------------------------------------------------- *
 * viewports/sky-view.js — classical sky stereographic projection (phase-6 stub).
 *
 * Looks up at the sky from observer (default Antikythera island, 35.86°N).
 * Horizon, meridian, ecliptic + 7 body dots at their longitudes. Dots fade
 * below the horizon. Heliacal rising / setting glow events come in phase 6.
 *
 * Phase-1 stub uses approximate ecliptic-only projection — no precise
 * horizon transform — so dots ride a simulated ecliptic ring in screen space.
 * ------------------------------------------------------------------------- */

const SIZE = 600;
const CX = SIZE / 2, CY = SIZE / 2;
const R_HORIZON = 270;
const R_ECLIPTIC = 220;

const PLANET_GLYPH = { mercury: "☿", venus: "♀", sun: "☉", mars: "♂", jupiter: "♃", saturn: "♄", moon: "☾" };
const PLANET_ORDER = ["sun","moon","mercury","venus","mars","jupiter","saturn"];

export function mountSkyView(host, state, onChange, bridge) {
  if (!host) return;
  const NS = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(NS, "svg");
  svg.setAttribute("viewBox", `0 0 ${SIZE} ${SIZE}`);
  svg.setAttribute("preserveAspectRatio", "xMidYMid meet");
  host.appendChild(svg);

  drawHorizon(svg);
  drawEcliptic(svg);
  drawCardinals(svg);
  const bodyG = childG(svg, "bodies");

  const readout = document.querySelector('.panel-header [data-vp="sky"]');

  let inflightJd = null;
  async function refresh(s) {
    inflightJd = s.jd;
    let dial;
    try { dial = await bridge.dialState(s.jd); }
    catch (e) { console.error("dialState (sky)", e); return; }
    if (inflightJd !== s.jd) return;
    drawBodies(bodyG, dial);
    if (readout) {
      const m = dial?.bodies?.moon;
      readout.textContent = m
        ? `Moon ${(m.illuminatedFrac * 100).toFixed(0)}% · age ${(m.ageDays || 0).toFixed(1)}d`
        : "—";
    }
  }
  refresh(state);
  onChange(refresh);
}

/* ---- background structure -------------------------------------------- */

function drawHorizon(svg) {
  const NS = "http://www.w3.org/2000/svg";
  const c = document.createElementNS(NS, "circle");
  c.setAttribute("cx", CX); c.setAttribute("cy", CY);
  c.setAttribute("r", R_HORIZON);
  c.setAttribute("fill", "var(--bg-0)");
  c.setAttribute("stroke", "var(--verdigris)");
  c.setAttribute("stroke-width", "1.4");
  c.setAttribute("stroke-opacity", "0.8");
  svg.appendChild(c);

  // Concentric altitude rings
  for (const r of [180, 90]) {
    const ring = document.createElementNS(NS, "circle");
    ring.setAttribute("cx", CX); ring.setAttribute("cy", CY);
    ring.setAttribute("r", r);
    ring.setAttribute("fill", "none");
    ring.setAttribute("stroke", "var(--verdigris)");
    ring.setAttribute("stroke-opacity", "0.25");
    ring.setAttribute("stroke-dasharray", "2 4");
    svg.appendChild(ring);
  }
}

function drawEcliptic(svg) {
  const NS = "http://www.w3.org/2000/svg";
  // Ecliptic as a tilted ellipse — simplified stand-in.
  const e = document.createElementNS(NS, "ellipse");
  e.setAttribute("cx", CX); e.setAttribute("cy", CY);
  e.setAttribute("rx", R_ECLIPTIC);
  e.setAttribute("ry", R_ECLIPTIC * 0.65);
  e.setAttribute("transform", `rotate(-23.4 ${CX} ${CY})`);
  e.setAttribute("fill", "none");
  e.setAttribute("stroke", "var(--accent)");
  e.setAttribute("stroke-opacity", "0.4");
  e.setAttribute("stroke-width", "1");
  e.setAttribute("stroke-dasharray", "3 3");
  svg.appendChild(e);
}

function drawCardinals(svg) {
  const NS = "http://www.w3.org/2000/svg";
  const dirs = [
    { x: CX,           y: CY - R_HORIZON - 12, label: "N" },
    { x: CX + R_HORIZON + 12, y: CY,           label: "E" },
    { x: CX,           y: CY + R_HORIZON + 14, label: "S" },
    { x: CX - R_HORIZON - 12, y: CY,           label: "W" },
  ];
  for (const d of dirs) {
    const t = document.createElementNS(NS, "text");
    t.setAttribute("x", d.x); t.setAttribute("y", d.y);
    t.setAttribute("text-anchor", "middle");
    t.setAttribute("dominant-baseline", "central");
    t.setAttribute("font-family", "IBM Plex Sans, sans-serif");
    t.setAttribute("font-size", "11");
    t.setAttribute("letter-spacing", "0.2em");
    t.setAttribute("fill", "var(--verdigris)");
    t.textContent = d.label;
    svg.appendChild(t);
  }
}

function drawBodies(g, dial) {
  const NS = "http://www.w3.org/2000/svg";
  g.innerHTML = "";
  if (!dial?.bodies) return;
  for (const name of PLANET_ORDER) {
    const body = dial.bodies[name];
    if (!body) continue;
    const angle = body.lonDeg;
    // Ecliptic projection: place around the tilted ellipse.
    const t = (angle - 90) * Math.PI / 180;
    const x0 = R_ECLIPTIC * Math.cos(t);
    const y0 = R_ECLIPTIC * 0.65 * Math.sin(t);
    // Rotate by -23.4° (ecliptic obliquity).
    const ob = -23.4 * Math.PI / 180;
    const x = CX + x0 * Math.cos(ob) - y0 * Math.sin(ob);
    const y = CY + x0 * Math.sin(ob) + y0 * Math.cos(ob);

    const dot = document.createElementNS(NS, "circle");
    dot.setAttribute("cx", x); dot.setAttribute("cy", y);
    dot.setAttribute("r", name === "sun" ? 7 : 4);
    dot.setAttribute("fill", `var(--body-${name})`);
    dot.setAttribute("stroke", "var(--bg-0)");
    dot.setAttribute("stroke-width", "1");
    g.appendChild(dot);

    const text = document.createElementNS(NS, "text");
    text.setAttribute("x", x);
    text.setAttribute("y", y - 10);
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
