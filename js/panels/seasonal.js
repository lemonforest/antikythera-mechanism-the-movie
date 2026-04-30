/* panels/seasonal.js — per-planet visibility windows across the current year. */

const PLANETS = ["mercury", "venus", "mars", "jupiter", "saturn"];

export function mountSeasonalPanel(host, state, onChange, bridge) {
  if (!host) return;
  host.innerHTML = `
    <h3>SEASONAL OBSERVABILITY</h3>
    <p class="dim">Per-planet visibility / invisibility windows across one synodic cycle, anchored on the year of the current JD.</p>
    <div id="seasonal-strips" style="display:grid;gap:8px;margin-top:8px"></div>
  `;
  const stripsHost = host.querySelector("#seasonal-strips");

  let lastYear = null;
  async function refresh(s) {
    const greg = await bridge.calendars(s.jd).then(c => c.gregorian);
    const year = greg?.year || 0;
    if (year === lastYear) return;
    lastYear = year;
    const out = await bridge.seasonalWindows(year);
    const w = out?.windows || {};
    stripsHost.innerHTML = PLANETS.map(p => {
      const apparitions = w[p] || [];
      const segments = apparitions.map(a => `
        <span style="
          display:inline-block;
          width:${((a.endDay - a.startDay) / 365 * 100).toFixed(2)}%;
          background:${a.state === 'visible' ? `var(--body-${p})` : 'var(--bg-3)'};
          opacity:${a.state === 'visible' ? '0.85' : '0.3'};
          height:14px;
          vertical-align:middle;
        " title="day ${a.startDay}–${a.endDay} ${a.state}"></span>
      `).join("");
      return `
        <div style="display:grid;grid-template-columns:80px 1fr;gap:8px;align-items:center">
          <span class="mono dim" style="font-size:11px">${p}</span>
          <div style="background:var(--bg-2);border:1px solid var(--line);font-size:0">${segments}</div>
        </div>
      `;
    }).join("");
  }
  refresh(state);
  onChange(refresh);
}
