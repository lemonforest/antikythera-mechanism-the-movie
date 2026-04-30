/* ------------------------------------------------------------------------- *
 * viewports/back-dial.js — Metonic + Saros spirals (phase-4 stub).
 *
 * Two Archimedean spirals side-by-side: Metonic (5 turns × 47 cells = 235)
 * on the left, Saros (4 turns × ~56 cells = 223) on the right. Current cell
 * highlighted gold. Sub-dials (Olympic, Callippic, Exeligmos) are inset.
 *
 * Phase-1 stub renders the two spirals + current-cell highlight + a small
 * sub-dial readout. Eclipse glyphs and click-through come in phase 4.
 * ------------------------------------------------------------------------- */

const SIZE_W = 760;
const SIZE_H = 480;

export function mountBackDial(host, state, onChange, bridge) {
  if (!host) return;
  const NS = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(NS, "svg");
  svg.setAttribute("viewBox", `0 0 ${SIZE_W} ${SIZE_H}`);
  svg.setAttribute("preserveAspectRatio", "xMidYMid meet");
  host.appendChild(svg);

  drawSpiral(svg, "metonic", { cx: 200, cy: 220, turns: 5,  cells: 235, color: "var(--metonic)", label: "Metonic" });
  drawSpiral(svg, "saros",   { cx: 560, cy: 220, turns: 4,  cells: 223, color: "var(--saros)",   label: "Saros"   });
  drawSubDials(svg);

  const cellGroup = childG(svg, "cells");
  const readout = document.querySelector('.panel-header [data-vp="back"]');

  let inflightJd = null;
  async function refresh(s) {
    inflightJd = s.jd;
    let dial;
    try { dial = await bridge.dialState(s.jd); }
    catch (e) { console.error("dialState (back)", e); return; }
    if (inflightJd !== s.jd) return;

    cellGroup.innerHTML = "";
    drawCurrentCell(cellGroup, dial?.dials?.Metonic, { cx: 200, cy: 220, turns: 5, cells: 235, color: "var(--accent)" });
    drawCurrentCell(cellGroup, dial?.dials?.Saros,   { cx: 560, cy: 220, turns: 4, cells: 223, color: "var(--accent)" });

    if (readout) {
      const m = dial?.dials?.Metonic;
      const s2 = dial?.dials?.Saros;
      readout.textContent =
        `Met ${m?.residue ?? "?"}/${m?.modulus ?? "?"} · Sar ${s2?.residue ?? "?"}/${s2?.modulus ?? "?"}`;
    }
  }
  refresh(state);
  onChange(refresh);
}

/* ---- spiral drawing --------------------------------------------------- */

function drawSpiral(svg, id, opts) {
  const NS = "http://www.w3.org/2000/svg";
  const g = childG(svg, id);
  const { cx, cy, turns, cells, color, label } = opts;
  const rMin = 30;
  const rMax = 165;
  const totalAngle = turns * 360;
  const stepAngle = totalAngle / cells;

  // Spiral path
  const path = document.createElementNS(NS, "path");
  let d = "";
  for (let i = 0; i <= cells; i++) {
    const angle = i * stepAngle;
    const r = rMin + (rMax - rMin) * (i / cells);
    const a = (angle - 90) * Math.PI / 180;
    const x = cx + r * Math.cos(a);
    const y = cy + r * Math.sin(a);
    d += (i === 0 ? "M " : "L ") + x.toFixed(2) + " " + y.toFixed(2) + " ";
  }
  path.setAttribute("d", d.trim());
  path.setAttribute("fill", "none");
  path.setAttribute("stroke", color);
  path.setAttribute("stroke-width", "1.4");
  path.setAttribute("stroke-opacity", "0.7");
  g.appendChild(path);

  // Cell ticks (one per cell)
  const ticks = childG(g, "ticks");
  for (let i = 0; i < cells; i += Math.ceil(cells / 60)) {  // sparse for legibility
    const angle = i * stepAngle;
    const r = rMin + (rMax - rMin) * (i / cells);
    const a = (angle - 90) * Math.PI / 180;
    const x1 = cx + r * Math.cos(a);
    const y1 = cy + r * Math.sin(a);
    const x2 = x1 + 4 * Math.cos(a + Math.PI / 2);
    const y2 = y1 + 4 * Math.sin(a + Math.PI / 2);
    const ln = document.createElementNS(NS, "line");
    ln.setAttribute("x1", x1); ln.setAttribute("y1", y1);
    ln.setAttribute("x2", x2); ln.setAttribute("y2", y2);
    ln.setAttribute("stroke", color);
    ln.setAttribute("stroke-opacity", "0.4");
    ticks.appendChild(ln);
  }

  // Label
  const text = document.createElementNS(NS, "text");
  text.setAttribute("x", cx);
  text.setAttribute("y", cy + rMax + 24);
  text.setAttribute("text-anchor", "middle");
  text.setAttribute("font-family", "IBM Plex Sans, sans-serif");
  text.setAttribute("font-size", "11");
  text.setAttribute("font-weight", "600");
  text.setAttribute("letter-spacing", "0.18em");
  text.setAttribute("fill", color);
  text.textContent = `${label} · ${cells}/${turns * 19}`;
  g.appendChild(text);
}

function drawCurrentCell(g, dialEntry, opts) {
  if (!dialEntry) return;
  const { cx, cy, turns, cells, color } = opts;
  const rMin = 30, rMax = 165;
  const totalAngle = turns * 360;
  const stepAngle = totalAngle / cells;
  const i = dialEntry.residue ?? 0;
  const angle = i * stepAngle;
  const r = rMin + (rMax - rMin) * (i / cells);
  const a = (angle - 90) * Math.PI / 180;
  const x = cx + r * Math.cos(a);
  const y = cy + r * Math.sin(a);

  const NS = "http://www.w3.org/2000/svg";
  const dot = document.createElementNS(NS, "circle");
  dot.setAttribute("cx", x); dot.setAttribute("cy", y);
  dot.setAttribute("r", 6);
  dot.setAttribute("fill", color);
  dot.setAttribute("stroke", "var(--bg-0)");
  dot.setAttribute("stroke-width", "1.5");
  g.appendChild(dot);

  // Spoke from centre → cell
  const c0x = cx, c0y = cy;
  const ln = document.createElementNS(NS, "line");
  ln.setAttribute("x1", c0x); ln.setAttribute("y1", c0y);
  ln.setAttribute("x2", x);   ln.setAttribute("y2", y);
  ln.setAttribute("stroke", color);
  ln.setAttribute("stroke-opacity", "0.4");
  ln.setAttribute("stroke-width", "1");
  g.appendChild(ln);
}

function drawSubDials(svg) {
  const NS = "http://www.w3.org/2000/svg";
  const subs = [
    { cx: 200, cy: 410, label: "Olympic / Games", color: "var(--olympic)" },
    { cx: 380, cy: 410, label: "Callippic 76 yr",  color: "var(--callip)"  },
    { cx: 560, cy: 410, label: "Exeligmos 54 yr",  color: "var(--exelig)"  },
  ];
  for (const s of subs) {
    const c = document.createElementNS(NS, "circle");
    c.setAttribute("cx", s.cx); c.setAttribute("cy", s.cy);
    c.setAttribute("r", 32);
    c.setAttribute("fill", "rgba(184, 128, 74, 0.06)");
    c.setAttribute("stroke", s.color);
    c.setAttribute("stroke-width", "1.4");
    svg.appendChild(c);
    const t = document.createElementNS(NS, "text");
    t.setAttribute("x", s.cx);
    t.setAttribute("y", s.cy + 50);
    t.setAttribute("text-anchor", "middle");
    t.setAttribute("font-family", "JetBrains Mono, monospace");
    t.setAttribute("font-size", "9");
    t.setAttribute("fill", s.color);
    t.textContent = s.label;
    svg.appendChild(t);
  }
}

function childG(parent, id) {
  const g = document.createElementNS("http://www.w3.org/2000/svg", "g");
  g.setAttribute("class", id);
  parent.appendChild(g);
  return g;
}
