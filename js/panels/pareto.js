/* panels/pareto.js — (precision, cost) Pareto frontier with Freeth's {7,17}. */

export function mountParetoPanel(host, state, onChange, bridge) {
  if (!host) return;
  host.innerHTML = `
    <h3>PARETO FRONTIER · (precision, cost)</h3>
    <p class="dim">Bronze-budget vs angular precision. Freeth 2021's prime alphabet {7, 17} is plotted as a marker; perturb with the input below.</p>
    <div style="margin:6px 0 10px 0">
      <label class="mono dim" style="font-size:11px">primes:</label>
      <input id="pareto-primes" type="text" value="7,17" style="
        background:var(--bg-2); color:var(--fg-0); border:1px solid var(--line-strong);
        font-family:var(--font-mono); font-size:11px; padding:4px 8px; width:140px;">
      <button id="pareto-go" class="hdr-btn" type="button">recompute</button>
    </div>
    <svg id="pareto-svg" viewBox="0 0 400 220" preserveAspectRatio="xMidYMid meet" style="width:100%;height:220px;background:var(--bg-2);border:1px solid var(--line)"></svg>
    <p id="pareto-meta" class="dim mono" style="margin-top:6px"></p>
  `;
  const input = host.querySelector("#pareto-primes");
  const btn   = host.querySelector("#pareto-go");
  const svg   = host.querySelector("#pareto-svg");
  const meta  = host.querySelector("#pareto-meta");

  btn.addEventListener("click", refresh);
  input.addEventListener("keydown", (e) => { if (e.key === "Enter") refresh(); });

  async function refresh() {
    const primes = input.value.split(",").map(s => parseInt(s.trim(), 10)).filter(Boolean);
    const out = await bridge.paretoFrontier(primes);
    drawFrontier(svg, out);
    meta.textContent = `Freeth marker: ${out.freethPoint?.precisionArcsec?.toFixed(1) || "—"}″ at cost ${out.freethPoint?.costTeeth ?? "—"}t · plotting ${out.points?.length || 0} points`;
  }
  refresh();
}

function drawFrontier(svg, data) {
  const NS = "http://www.w3.org/2000/svg";
  svg.innerHTML = "";
  const points = data?.points || [];
  if (!points.length) return;

  const pad = 24;
  const W = 400, H = 220;
  const xs = points.map(p => p.costTeeth);
  const ys = points.map(p => p.precisionArcsec);
  const xMin = Math.min(...xs), xMax = Math.max(...xs);
  const yMin = Math.min(...ys), yMax = Math.max(...ys);

  const sx = (v) => pad + (v - xMin) / (xMax - xMin || 1) * (W - 2 * pad);
  const sy = (v) => H - pad - (v - yMin) / (yMax - yMin || 1) * (H - 2 * pad);

  // axes
  for (const a of [["axis-x", pad, H - pad, W - pad, H - pad],
                   ["axis-y", pad, pad,    pad,     H - pad]]) {
    const ln = document.createElementNS(NS, "line");
    ln.setAttribute("x1", a[1]); ln.setAttribute("y1", a[2]);
    ln.setAttribute("x2", a[3]); ln.setAttribute("y2", a[4]);
    ln.setAttribute("stroke", "var(--line-strong)");
    svg.appendChild(ln);
  }

  // frontier polyline
  const sorted = points.slice().sort((a, b) => a.costTeeth - b.costTeeth);
  const path = document.createElementNS(NS, "path");
  let d = "";
  sorted.forEach((p, i) => {
    d += (i === 0 ? "M " : "L ") + sx(p.costTeeth).toFixed(2) + " " + sy(p.precisionArcsec).toFixed(2) + " ";
  });
  path.setAttribute("d", d.trim());
  path.setAttribute("fill", "none");
  path.setAttribute("stroke", "var(--accent-cool)");
  path.setAttribute("stroke-width", "1.6");
  svg.appendChild(path);

  // dots
  for (const p of points) {
    const c = document.createElementNS(NS, "circle");
    c.setAttribute("cx", sx(p.costTeeth));
    c.setAttribute("cy", sy(p.precisionArcsec));
    c.setAttribute("r", 3);
    c.setAttribute("fill", "var(--accent-cool)");
    svg.appendChild(c);
  }

  // Freeth marker
  if (data?.freethPoint) {
    const fx = sx(data.freethPoint.costTeeth);
    const fy = sy(data.freethPoint.precisionArcsec);
    const c = document.createElementNS(NS, "circle");
    c.setAttribute("cx", fx); c.setAttribute("cy", fy);
    c.setAttribute("r", 6);
    c.setAttribute("fill", "var(--accent)");
    c.setAttribute("stroke", "var(--bg-0)");
    c.setAttribute("stroke-width", "1.5");
    svg.appendChild(c);
    const t = document.createElementNS(NS, "text");
    t.setAttribute("x", fx + 9); t.setAttribute("y", fy + 4);
    t.setAttribute("font-family", "JetBrains Mono, monospace");
    t.setAttribute("font-size", "10");
    t.setAttribute("fill", "var(--accent)");
    t.textContent = "Freeth {7,17}";
    svg.appendChild(t);
  }

  // axis labels
  const labels = [
    { x: W / 2,    y: H - 6, text: "cost (teeth, max single bronze cut)" },
    { x: 8,        y: H / 2, text: "precision (arcsec, lower is better)", rotate: true },
  ];
  for (const l of labels) {
    const t = document.createElementNS(NS, "text");
    t.setAttribute("x", l.x); t.setAttribute("y", l.y);
    t.setAttribute("text-anchor", "middle");
    t.setAttribute("font-family", "IBM Plex Sans, sans-serif");
    t.setAttribute("font-size", "9");
    t.setAttribute("fill", "var(--fg-3)");
    if (l.rotate) t.setAttribute("transform", `rotate(-90 ${l.x} ${l.y})`);
    t.textContent = l.text;
    svg.appendChild(t);
  }
}
