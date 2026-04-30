/* panels/ephem.js — DE421 / DE441 / DE441_part1 ephemeris diff sparklines. */

const BODIES = ["sun","moon","mercury","venus","mars","jupiter","saturn"];

export function mountEphemPanel(host, state, onChange, bridge) {
  if (!host) return;
  host.innerHTML = `
    <h3>EPHEMERIS Δ (arcsec)</h3>
    <p class="dim">DE421 vs DE441 vs DE441_part1 differences for each body at current JD.</p>
    <table class="hypoth-table">
      <thead><tr><th>Body</th><th>Δ DE421</th><th>Δ DE441</th><th>Δ DE441_part1</th></tr></thead>
      <tbody id="ephem-rows"></tbody>
    </table>
    <p class="dim mono" style="margin-top:8px">Δ in arcsec relative to DE441 reference (live mode) or synthesized noise (demo).</p>
  `;
  const tbody = host.querySelector("#ephem-rows");

  let inflightJd = null;
  async function refresh(s) {
    inflightJd = s.jd;
    const out = await Promise.all(BODIES.map(b => bridge.ephemDiff(s.jd, b)));
    if (inflightJd !== s.jd) return;
    tbody.innerHTML = BODIES.map((b, i) => {
      const e = out[i] || {};
      return `<tr>
        <td>${b}</td>
        <td>${fmt(e.de421?.lonArcsec)}</td>
        <td>${fmt(e.de441?.lonArcsec)}</td>
        <td>${fmt(e.de441_part1?.lonArcsec)}</td>
      </tr>`;
    }).join("");
  }
  function fmt(v) {
    if (v == null) return "—";
    return v.toFixed(3);
  }
  refresh(state);
  onChange(refresh);
}
