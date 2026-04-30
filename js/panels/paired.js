/* panels/paired.js — paired-chain differentials per planet. */

const PLANETS = ["mercury", "venus", "mars", "jupiter", "saturn"];

export function mountPairedPanel(host, state, onChange, bridge) {
  if (!host) return;
  host.innerHTML = `
    <h3>PAIRED-CHAIN DIFFERENTIALS</h3>
    <p class="dim">Per-planet candidates: canonical period relation + Freeth 2021 (shared-prime reuse). Venus's 5/8 vs 289/462 differential is the showcase.</p>
    <div class="seg-control" id="paired-planets" role="group">
      ${PLANETS.map((p, i) => `<button class="seg-btn ${i === 1 ? "active" : ""}" data-planet="${p}" type="button">${p}</button>`).join("")}
    </div>
    <dl class="info-grid mono" id="paired-data" style="margin-top:14px"></dl>
  `;
  const planetSel = host.querySelector("#paired-planets");
  const dataHost  = host.querySelector("#paired-data");
  let planet = "venus";

  planetSel.addEventListener("click", (ev) => {
    const btn = ev.target.closest("button[data-planet]");
    if (!btn) return;
    planet = btn.dataset.planet;
    planetSel.querySelectorAll("button").forEach(b => b.classList.toggle("active", b === btn));
    refresh();
  });

  async function refresh() {
    const out = await bridge.pairedChains(planet);
    if (!out?.ok) {
      dataHost.innerHTML = `<dt>error</dt><dd>${out?.error || "no data"}</dd>`;
      return;
    }
    const c = out.canonical || {};
    const f = out.freeth || {};
    const sp = (xs) => Array.isArray(xs) && xs.length ? xs.map(p => `<span style="color:var(--prime-${p})">${p}</span>`).join(" · ") : "—";
    dataHost.innerHTML = `
      <dt>planet</dt>           <dd>${planet}</dd>
      <dt>canonical ratio</dt>  <dd>${c.ratio || "—"}</dd>
      <dt>canonical teeth</dt>  <dd>${(c.teeth || []).join(", ")}</dd>
      <dt>Freeth ratio</dt>     <dd>${f.ratio || "—"}</dd>
      <dt>Freeth teeth</dt>     <dd>${(f.teeth || []).join(", ")}</dd>
      <dt>shared primes</dt>    <dd>${sp(f.sharedPrimes)}</dd>
      <dt>differential</dt>     <dd>${out.differential?.description || "—"}</dd>
    `;
  }
  refresh();
}
