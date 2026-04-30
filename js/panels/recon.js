/* panels/recon.js — Freeth 2021 / Wright / Price 1974 comparison. */

const COLUMNS = ["freeth2021", "wright", "price1974"];
const COLUMN_LABELS = { freeth2021: "Freeth 2021", wright: "Wright", price1974: "Price 1974" };

export function mountReconPanel(host, state, onChange, bridge) {
  if (!host) return;
  host.innerHTML = `
    <h3>RECONSTRUCTION COMPARE</h3>
    <p class="dim">Three reconstructions evaluated at current JD. The b1 main wheel disagreement (224 vs 223 teeth) is called out below.</p>
    <div id="recon-grid"></div>
    <h3 style="margin-top:14px">b1 MAIN WHEEL</h3>
    <dl class="info-grid mono">
      <dt>Freeth 2021</dt><dd>223 teeth (matches Saros)</dd>
      <dt>Wright</dt>     <dd>223 teeth</dd>
      <dt>Price 1974</dt> <dd class="tag-partial">224 teeth (legacy reading)</dd>
    </dl>
  `;
  const gridHost = host.querySelector("#recon-grid");

  let inflightJd = null;
  async function refresh(s) {
    inflightJd = s.jd;
    const cmp = await bridge.reconCompare(s.jd);
    if (inflightJd !== s.jd) return;
    const planets = ["mercury","venus","sun","mars","jupiter","saturn"];
    gridHost.innerHTML = planets.map(p => `
      <div class="recon-bar">
        <span>${p}</span>
        <div class="meter"><span style="width:${columnMeter(cmp, p)}%"></span></div>
        <span class="dim">${formatBodyDelta(cmp, p)}</span>
      </div>
    `).join("");
  }
  refresh(state);
  onChange(refresh);
}

function columnMeter(cmp, planet) {
  if (!cmp) return 0;
  const f = cmp.freeth2021?.bodies?.[planet]?.lonDeg;
  const w = cmp.wright?.bodies?.[planet]?.lonDeg;
  if (f == null || w == null) return 50;
  const delta = Math.abs(((f - w) % 360 + 540) % 360 - 180);
  return Math.max(2, Math.min(100, 100 - delta * 2));
}

function formatBodyDelta(cmp, planet) {
  if (!cmp) return "—";
  const ks = COLUMNS.map(k => cmp[k]?.bodies?.[planet]?.lonDeg).filter(v => v != null);
  if (ks.length < 2) return "—";
  const max = Math.max(...ks), min = Math.min(...ks);
  return `Δ ${(max - min).toFixed(2)}°`;
}
