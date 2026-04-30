/* panels/hypoth.js — 31-row hypothesis battery from antikythera-spectral. */

const STATUS_CLASS = {
  PASS:         "tag-pass",
  PARTIAL:      "tag-partial",
  FAIL:         "tag-fail",
  UNDETERMINED: "tag-undet",
};

const CATEGORY_LABEL = {
  A: "algorithmic",
  B: "algebraic",
  C: "computational",
  D: "decoding",
  E: "encoder",
  F: "fail-modes",
  G: "gear-architecture",
  H: "historical-comparison",
};

export function mountHypothPanel(host, state, onChange, bridge) {
  if (!host) return;
  host.innerHTML = `
    <h3>HYPOTHESIS BATTERY · 31 rows</h3>
    <p id="hypoth-meta" class="dim mono"></p>
    <table class="hypoth-table" id="hypoth-table">
      <thead><tr><th style="width:8%">id</th><th style="width:14%">cat</th><th>statement</th><th style="width:14%">status</th></tr></thead>
      <tbody></tbody>
    </table>
  `;
  const tbody = host.querySelector("tbody");
  const meta  = host.querySelector("#hypoth-meta");

  let lastRegime = null, lastKernel = null;

  async function refresh(s) {
    if (s.regime === lastRegime && lastKernel) return;  // no need to recompute on JD change
    lastRegime = s.regime;
    lastKernel = "DE441";
    const data = await bridge.hypothesisBattery({ regime: s.regime, kernel: lastKernel });
    const counts = data.rows.reduce((acc, r) => {
      acc[r.status] = (acc[r.status] || 0) + 1; return acc;
    }, {});
    meta.textContent =
      `${data.n_rows} rows · ${counts.PASS || 0} pass · ${counts.PARTIAL || 0} partial · ${counts.FAIL || 0} fail · ${counts.UNDETERMINED || 0} undetermined · regime=${s.regime}`;

    tbody.innerHTML = data.rows.map(r => {
      // Live mode rows don't carry a category field — derive from id prefix.
      const cat = r.category || (r.id || "").split("-")[0];
      return `
      <tr>
        <td>${r.id}</td>
        <td class="dim">${CATEGORY_LABEL[cat] || cat || "—"}</td>
        <td>${escape(r.statement || "")}</td>
        <td class="${STATUS_CLASS[r.status] || ""}">${r.status}</td>
      </tr>
      <tr class="hypoth-detail" style="display:none"><td></td><td colspan="3" class="dim">${escape(r.notes || "")}</td></tr>
    `;}).join("");
    tbody.querySelectorAll("tr:not(.hypoth-detail)").forEach((tr, i) => {
      tr.style.cursor = "pointer";
      tr.addEventListener("click", () => {
        const detail = tbody.querySelectorAll("tr.hypoth-detail")[i];
        if (detail) detail.style.display = detail.style.display === "none" ? "table-row" : "none";
      });
    });
  }

  refresh(state);
  onChange(refresh);
}

function escape(s) {
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
