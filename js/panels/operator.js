/* panels/operator.js — historical recalibration ritual stub. */

const ANCHORS = [
  { id: "olympic",   label: "Olympic / Games (4 yr)" },
  { id: "metonic",   label: "Metonic (19 yr)" },
  { id: "saros",     label: "Saros (≈18 yr 11 d)" },
  { id: "callippic", label: "Callippic (76 yr)" },
];

export function mountOperatorPanel(host, state, onChange, bridge) {
  if (!host) return;
  host.innerHTML = `
    <h3>OPERATOR RECALIBRATION</h3>
    <p class="dim">Drag the Egyptian calendar ring to a known anchor; advance the device; drift accumulates; re-zero at the next anchor.</p>
    <div class="seg-control" id="op-anchors" role="group" aria-label="Anchor selection">
      ${ANCHORS.map((a, i) => `
        <button class="seg-btn ${i === 0 ? "active" : ""}" data-anchor="${a.id}" type="button">${a.label}</button>
      `).join("")}
    </div>
    <dl class="info-grid mono" id="op-readout" style="margin-top:14px">
      <dt>anchor</dt>     <dd id="op-anchor">olympic</dd>
      <dt>JD now</dt>     <dd id="op-jd">—</dd>
      <dt>drift since</dt><dd id="op-drift">—</dd>
      <dt>recommendation</dt><dd id="op-rec">—</dd>
    </dl>
  `;
  const anchorSel = host.querySelector("#op-anchors");
  let anchor = "olympic";
  anchorSel.addEventListener("click", (ev) => {
    const btn = ev.target.closest("button[data-anchor]");
    if (!btn) return;
    anchor = btn.dataset.anchor;
    anchorSel.querySelectorAll("button").forEach(b => b.classList.toggle("active", b === btn));
    refresh(state);
  });

  async function refresh(s) {
    const out = await bridge.operatorRecalibrate(anchor, s.jd);
    host.querySelector("#op-anchor").textContent = anchor;
    host.querySelector("#op-jd").textContent = s.jd.toFixed(2);
    host.querySelector("#op-drift").textContent = (out?.driftDeg ?? 0).toFixed(2) + "°";
    host.querySelector("#op-rec").textContent =
      Math.abs(out?.driftDeg ?? 0) > 1
        ? "re-zero recommended"
        : "within tolerance";
  }
  refresh(state);
  onChange(refresh);
}
