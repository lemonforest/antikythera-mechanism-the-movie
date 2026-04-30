/* panels/eclipses.js — next 10 eclipses from current JD. */

export function mountEclipsesPanel(host, state, onChange, bridge) {
  if (!host) return;
  host.innerHTML = `
    <h3>NEXT 10 ECLIPSES</h3>
    <p class="dim">From current JD forward — click a row to jump there.</p>
    <table class="hypoth-table" id="ecl-table">
      <thead>
        <tr><th>JD</th><th>Type</th><th>Magnitude</th><th>ΔJD</th></tr>
      </thead>
      <tbody></tbody>
    </table>
  `;
  const tbody = host.querySelector("tbody");

  let inflightJd = null;
  async function refresh(s) {
    inflightJd = s.jd;
    // ~30 yr forward window; fallback truncates to 60 entries.
    const out = await bridge.eclipses(s.jd, s.jd + 365 * 30);
    if (inflightJd !== s.jd) return;
    const ecl = out?.eclipses || [];
    tbody.innerHTML = ecl.slice(0, 10).map(e => `
      <tr data-jd="${e.jd}">
        <td>${typeof e.jd === "number" ? e.jd.toFixed(2) : e.jd}</td>
        <td class="${e.type === 'solar' ? 'tag-fail' : 'tag-pass'}">${e.type ?? '—'}</td>
        <td>${e.magnitude != null ? e.magnitude.toFixed(2) : '—'}</td>
        <td>${typeof e.jd === "number" ? (e.jd - s.jd).toFixed(1) + "d" : '—'}</td>
      </tr>
    `).join("") || `<tr><td colspan="4" class="dim">no eclipses in window</td></tr>`;
    tbody.querySelectorAll("tr[data-jd]").forEach(tr => {
      tr.style.cursor = "pointer";
      tr.addEventListener("click", () => {
        const jd = parseFloat(tr.dataset.jd);
        if (!Number.isNaN(jd)) {
          const ev = new CustomEvent("ak-jump-jd", { detail: jd, bubbles: true });
          host.dispatchEvent(ev);
        }
      });
    });
  }
  refresh(state);
  onChange(refresh);
}
