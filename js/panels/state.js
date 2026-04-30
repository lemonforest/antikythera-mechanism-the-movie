/* panels/state.js — full 13-dial readout in mono table form. */

export function mountStatePanel(host, state, onChange, bridge) {
  if (!host) return;
  host.innerHTML = `
    <h3>DIAL STATE</h3>
    <p class="dim">Live JD-driven values from <code class="mono">bridge.dialState(jd)</code>.</p>
    <table class="hypoth-table" id="state-table">
      <thead>
        <tr><th>Dial</th><th>Residue</th><th>Modulus</th><th>Angle (°)</th><th>Cycle (d)</th></tr>
      </thead>
      <tbody></tbody>
    </table>
    <p class="dim mono" id="state-meta">JD …</p>
  `;
  const tbody = host.querySelector("tbody");
  const meta  = host.querySelector("#state-meta");

  let inflightJd = null;
  async function refresh(s) {
    inflightJd = s.jd;
    const dial = await bridge.dialState(s.jd);
    if (inflightJd !== s.jd) return;
    const dials = dial?.dials || {};
    tbody.innerHTML = Object.entries(dials).map(([name, d]) => `
      <tr>
        <td>${name}</td>
        <td>${d.residue ?? "—"}</td>
        <td>${d.modulus ?? "—"}</td>
        <td>${(d.angle_deg ?? 0).toFixed(2)}</td>
        <td>${(d.cycle_period_days ?? 0).toFixed(2)}</td>
      </tr>
    `).join("");
    meta.textContent = `JD ${s.jd.toFixed(2)} · ${dial?._mock ? "demo" : "live"}`;
  }
  refresh(state);
  onChange(refresh);
}
