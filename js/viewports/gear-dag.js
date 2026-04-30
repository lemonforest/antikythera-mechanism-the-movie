/* ------------------------------------------------------------------------- *
 * viewports/gear-dag.js — periphery-rule gear DAG (phase-8 stub).
 *
 * Layered crank → trunk bridges (b1, e5) → leaves (i1, k2, m1). Solid for
 * surviving gears, dashed for conjectural. Architecture toggles (clutch /
 * setting / missing) glow the affected nodes. Hovering a node will, in
 * phase 8, highlight its train across all viewports.
 *
 * Phase-1 stub draws static layered layout from bridge.gearDag().
 * ------------------------------------------------------------------------- */

const SIZE_W = 760;
const SIZE_H = 480;
const PAD_X = 60, PAD_Y = 50;

export function mountGearDag(host, state, onChange, bridge) {
  if (!host) return;
  const NS = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(NS, "svg");
  svg.setAttribute("viewBox", `0 0 ${SIZE_W} ${SIZE_H}`);
  svg.setAttribute("preserveAspectRatio", "xMidYMid meet");
  host.appendChild(svg);

  const readout = document.querySelector('.panel-header [data-vp="dag"]');

  bridge.gearDag().then((dag) => {
    if (!dag) return;
    const layout = layoutDag(dag);
    drawEdges(svg, layout, dag.edges);
    drawNodes(svg, layout, dag.nodes, state);
    if (readout) {
      const surv = dag.nodes.filter(n => n.surviving).length;
      const conj = dag.nodes.length - surv;
      readout.textContent = `${surv} surviving · ${conj} conjectural`;
    }
  });

  // Re-paint highlight on architecture-mode change.
  onChange((s) => paintArch(svg, s));
}

/* ---- layout ---------------------------------------------------------- */

function layoutDag(dag) {
  // Group by layer; spread evenly within layer; layers march left → right.
  const byLayer = {};
  for (const n of dag.nodes) {
    (byLayer[n.layer] = byLayer[n.layer] || []).push(n);
  }
  const layers = Object.keys(byLayer).map(Number).sort((a, b) => a - b);
  const xStep = (SIZE_W - 2 * PAD_X) / Math.max(1, layers.length - 1);
  const pos = {};
  for (const lay of layers) {
    const ns = byLayer[lay];
    const yStep = (SIZE_H - 2 * PAD_Y) / Math.max(1, ns.length - 1);
    ns.forEach((n, i) => {
      pos[n.id] = {
        x: PAD_X + lay * xStep,
        y: ns.length === 1
          ? SIZE_H / 2
          : PAD_Y + i * yStep,
      };
    });
  }
  return pos;
}

function drawEdges(svg, pos, edges) {
  const NS = "http://www.w3.org/2000/svg";
  for (const e of edges) {
    const a = pos[e.from], b = pos[e.to];
    if (!a || !b) continue;
    const path = document.createElementNS(NS, "path");
    // gentle bezier so overlapping layers stay legible
    const mx = (a.x + b.x) / 2;
    path.setAttribute("d", `M${a.x},${a.y} C${mx},${a.y} ${mx},${b.y} ${b.x},${b.y}`);
    path.setAttribute("fill", "none");
    path.setAttribute("stroke", "var(--line-strong)");
    path.setAttribute("stroke-opacity", "0.5");
    path.setAttribute("stroke-width", "1");
    svg.appendChild(path);
  }
}

function drawNodes(svg, pos, nodes, state) {
  const NS = "http://www.w3.org/2000/svg";
  for (const n of nodes) {
    const p = pos[n.id];
    if (!p) continue;
    const g = document.createElementNS(NS, "g");
    g.setAttribute("class", `gear-node ${n.surviving ? "surviving" : "conjectural"}`);
    g.setAttribute("data-id", n.id);
    g.setAttribute("transform", `translate(${p.x},${p.y})`);

    const teeth = n.teeth || 0;
    const teethColor = teeth === 7  ? "var(--prime-7)"
                     : teeth === 17 ? "var(--prime-17)"
                     : "var(--bronze)";

    const c = document.createElementNS(NS, "circle");
    c.setAttribute("r", 14);
    c.setAttribute("fill", n.surviving ? "var(--bg-2)" : "var(--bg-1)");
    c.setAttribute("stroke", teethColor);
    c.setAttribute("stroke-width", n.surviving ? "1.6" : "1");
    if (!n.surviving) c.setAttribute("stroke-dasharray", "3 2");
    g.appendChild(c);

    const id = document.createElementNS(NS, "text");
    id.setAttribute("text-anchor", "middle");
    id.setAttribute("dominant-baseline", "central");
    id.setAttribute("font-family", "JetBrains Mono, monospace");
    id.setAttribute("font-size", "9");
    id.setAttribute("fill", "var(--fg-0)");
    id.textContent = n.id;
    g.appendChild(id);

    const teethText = document.createElementNS(NS, "text");
    teethText.setAttribute("y", 28);
    teethText.setAttribute("text-anchor", "middle");
    teethText.setAttribute("font-family", "JetBrains Mono, monospace");
    teethText.setAttribute("font-size", "9");
    teethText.setAttribute("fill", teethColor);
    teethText.textContent = teeth ? `${teeth}t` : "";
    g.appendChild(teethText);

    if (n.label) {
      const labelText = document.createElementNS(NS, "text");
      labelText.setAttribute("y", -22);
      labelText.setAttribute("text-anchor", "middle");
      labelText.setAttribute("font-family", "IBM Plex Sans, sans-serif");
      labelText.setAttribute("font-size", "9");
      labelText.setAttribute("font-style", "italic");
      labelText.setAttribute("fill", "var(--fg-2)");
      labelText.textContent = n.label;
      g.appendChild(labelText);
    }

    svg.appendChild(g);
  }
}

function paintArch(svg, state) {
  // Highlight nodes affected by current architecture toggles.
  const affected = new Set();
  if (state.arch.clutch)  ["a1"].forEach(x => affected.add(x));
  if (state.arch.setting) ["c2","d2","e1"].forEach(x => affected.add(x));
  if (state.arch.missing) ["i1","k2","m1","j1","j2","n1","n2","p1","p2"].forEach(x => affected.add(x));

  svg.querySelectorAll(".gear-node").forEach((g) => {
    const c = g.querySelector("circle");
    if (!c) return;
    if (affected.has(g.dataset.id)) {
      c.setAttribute("stroke", "var(--accent)");
      c.setAttribute("stroke-width", "2.2");
    } else {
      const conj = g.classList.contains("conjectural");
      const teeth = g.querySelector("text:nth-of-type(2)")?.textContent || "";
      const t = parseInt(teeth, 10);
      const col = t === 7 ? "var(--prime-7)" : t === 17 ? "var(--prime-17)" : "var(--bronze)";
      c.setAttribute("stroke", col);
      c.setAttribute("stroke-width", conj ? "1" : "1.6");
    }
  });
}
