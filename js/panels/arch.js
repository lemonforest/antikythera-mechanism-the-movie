/* panels/arch.js — architectural-mode hypothesis toggles (G-H4..G-H8). */

const MODES = [
  { id: "clutch",  label: "Crank-as-clutch",         confidence: "MODERATE" },
  { id: "setting", label: "Setting-mode wheels",     confidence: "HIGH"     },
  { id: "missing", label: "Show conjectural gears",  confidence: "LOW"      },
  { id: "lock",    label: "Selective lock (G-H6)",   confidence: "MODERATE" },
  { id: "carrier", label: "Carrier gears (G-H7)",    confidence: "LOW"      },
  { id: "release", label: "Release elements (G-H5)", confidence: "MODERATE" },
];

const CONF_COLOR = { HIGH: "tag-pass", MODERATE: "tag-partial", LOW: "tag-fail" };

export function mountArchPanel(host, state, onChange, bridge, setState) {
  if (!host) return;
  host.innerHTML = `
    <h3>ARCHITECTURE MODES</h3>
    <p class="dim">Toggle structural hypotheses. Effects are surfaced in the Gear DAG viewport and (where applicable) in front-dial pointer behaviour.</p>
    <table class="hypoth-table">
      <thead><tr><th>mode</th><th>state</th><th>confidence</th><th>notes</th></tr></thead>
      <tbody>
        ${MODES.map(m => `
          <tr>
            <td>${m.label}</td>
            <td>
              <button class="hdr-btn" data-mode="${m.id}" type="button" aria-pressed="${state.arch?.[m.id] ? "true" : "false"}">
                ${state.arch?.[m.id] ? "ON" : "OFF"}
              </button>
            </td>
            <td class="${CONF_COLOR[m.confidence]}">${m.confidence}</td>
            <td class="dim" id="note-${m.id}">—</td>
          </tr>
        `).join("")}
      </tbody>
    </table>
  `;

  host.querySelectorAll("button[data-mode]").forEach(btn => {
    btn.addEventListener("click", async () => {
      const id = btn.dataset.mode;
      const next = !(state.arch?.[id]);
      setState({ arch: { ...state.arch, [id]: next } });
      btn.textContent = next ? "ON" : "OFF";
      btn.setAttribute("aria-pressed", next ? "true" : "false");
      // Pull a fresh summary from the bridge.
      const out = await bridge.architectureMode(id, next, state.jd);
      const noteEl = host.querySelector(`#note-${id}`);
      if (noteEl) noteEl.textContent = out?.summary || (next ? "engaged" : "disengaged");
    });
  });
}
