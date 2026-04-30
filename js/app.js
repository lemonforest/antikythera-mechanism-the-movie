/* ------------------------------------------------------------------------- *
 * app.js — boot orchestrator + viewport / panel mounting + DOM wiring.
 *
 * Canonical state, pub/sub, hash sync, and the play loop live in state.js so
 * HUD modules can import them without creating ES-module cycles back to app.js.
 * ------------------------------------------------------------------------- */

import {
  state, setState, onChange, readHash, todayJD, REFERENCE_JD,
} from "./state.js";

import { Bridge } from "./bridge.js";
import { mountFrontDial }  from "./viewports/front-dial.js";
import { mountBackDial }   from "./viewports/back-dial.js";
import { mountSkyView }    from "./viewports/sky-view.js";
import { mountOrrery }     from "./viewports/orrery.js";
import { mountGearDag }    from "./viewports/gear-dag.js";
import { mountCalendars }  from "./hud/calendars.js";
import { mountScrubber }   from "./hud/scrubber.js";
import { bindKeyboard }    from "./hud/keyboard.js";
import { mountStatePanel }     from "./panels/state.js";
import { mountEclipsesPanel }  from "./panels/eclipses.js";
import { mountReconPanel }     from "./panels/recon.js";
import { mountEphemPanel }     from "./panels/ephem.js";
import { mountHypothPanel }    from "./panels/hypoth.js";
import { mountOperatorPanel }  from "./panels/operator.js";
import { mountArchPanel }      from "./panels/arch.js";
import { mountPairedPanel }    from "./panels/paired.js";
import { mountSeasonalPanel }  from "./panels/seasonal.js";
import { mountParetoPanel }    from "./panels/pareto.js";

/* ----- boot --------------------------------------------------------------- */

const bootEl       = document.getElementById("boot");
const bootStatusEl = document.getElementById("boot-status");
const bootProgEl   = document.getElementById("boot-progress");
const bootLogEl    = document.getElementById("boot-log");
const viewerEl     = document.getElementById("viewer");
const dockEl       = document.getElementById("dock");
const railEl       = document.getElementById("rail");

const bootLog = (msg, cls = "") => {
  const li = document.createElement("li");
  if (cls) li.className = cls;
  li.textContent = msg;
  bootLogEl.appendChild(li);
  bootLogEl.scrollTop = bootLogEl.scrollHeight;
};
const bootProgress = (pct, status) => {
  bootProgEl.style.width = `${pct}%`;
  if (status) bootStatusEl.textContent = status;
};

async function boot() {
  readHash();
  document.body.classList.add("state-loading");

  bootLog("scaffold ready");
  bootProgress(5, "scaffold");

  const bridge = new Bridge({
    onLog: (msg, cls) => bootLog(msg, cls),
    onProgress: (pct, status) => bootProgress(pct, status),
  });

  try {
    await bridge.boot();
  } catch (err) {
    bootLog(`runtime failed to load: ${err.message}`, "fail");
    showBootError(err);
    return;
  }
  bootProgress(95, "live");

  // Hand the bridge to the rest of the app.
  window.__ak = bridge;          // useful for console poking
  mountUI(bridge);

  bootProgress(100, "live");
  // Reveal grid; hide boot.
  bootEl.hidden = true;
  viewerEl.hidden = false;
  dockEl.hidden = false;
  document.body.classList.remove("state-loading");
}

function showBootError(err) {
  bootStatusEl.textContent = "fail";
  bootStatusEl.style.color = "var(--fail)";
  const card = bootEl.querySelector(".boot-card");
  if (!card) return;
  const retry = document.createElement("div");
  retry.className = "boot-retry";
  retry.innerHTML = `
    <p style="color: var(--fail); margin: 14px 0 6px 0; font-size: 12px;">
      Couldn't load the Python runtime in this browser. Pyodide needs network
      access to <code class="mono">cdn.jsdelivr.net</code> and a browser that
      supports WebAssembly.
    </p>
    <p style="color: var(--fg-2); margin: 0 0 12px 0; font-size: 11px;">
      ${escapeHtml(err.message || String(err))}
    </p>
    <button class="ghost-btn" type="button" id="boot-retry-btn">RELOAD</button>
  `;
  card.appendChild(retry);
  document.getElementById("boot-retry-btn")?.addEventListener("click",
    () => location.reload());
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#039;");
}

/* ----- mount everything once the bridge is ready -------------------------- */

function mountUI(bridge) {
  // HUD
  mountCalendars(document.getElementById("calendar-readout"), state, onChange, bridge);
  mountScrubber(railEl, state, setState, bridge);
  bindKeyboard(state, setState);

  // Topbar buttons
  document.getElementById("btn-today").addEventListener("click",
    () => setState({ jd: todayJD() }));
  document.getElementById("btn-epoch").addEventListener("click",
    () => setState({ jd: REFERENCE_JD }));
  document.getElementById("btn-help").addEventListener("click", toggleHelp);
  document.querySelector("#help-overlay")?.addEventListener("click",
    (e) => { if (e.target.id === "help-overlay") toggleHelp(); });

  // Reconstruction column buttons (left rail)
  railEl.querySelectorAll("[data-recon]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const recon = btn.dataset.recon;
      setState({ recon });
      railEl.querySelectorAll("[data-recon]").forEach((b) =>
        b.classList.toggle("active", b.dataset.recon === recon));
    });
  });
  // Operation regime buttons
  railEl.querySelectorAll("[data-regime]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const regime = btn.dataset.regime;
      setState({ regime });
      railEl.querySelectorAll("[data-regime]").forEach((b) =>
        b.classList.toggle("active", b.dataset.regime === regime));
    });
  });

  // 5 viewports
  mountFrontDial(document.querySelector('[data-host="front"]'),  state, onChange, bridge);
  mountBackDial (document.querySelector('[data-host="back"]'),   state, onChange, bridge);
  mountSkyView  (document.querySelector('[data-host="sky"]'),    state, onChange, bridge);
  mountOrrery   (document.querySelector('[data-host="orrery"]'), state, onChange, bridge);
  mountGearDag  (document.querySelector('[data-host="dag"]'),    state, onChange, bridge);

  // Inject a maximize/restore button into every viewport's header. State
  // lives in `state.maximized` (null | viewport id) and is hash-synced.
  viewerEl.querySelectorAll(".viewport").forEach((vp) => {
    const id = vp.id.replace("vp-", "");
    const controls = vp.querySelector(".panel-header .header-controls");
    if (!controls) return;
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "hdr-btn maximize-btn";
    btn.dataset.maxFor = id;
    btn.setAttribute("aria-pressed", "false");
    btn.textContent = "⛶";
    btn.addEventListener("click", () =>
      setState({ maximized: state.maximized === id ? null : id }));
    controls.appendChild(btn);
  });
  applyMaximized(state);
  onChange(applyMaximized);

  // Collapse button on the gear-DAG header. Collapsing it shrinks the bottom
  // row to its header height, giving the 2x2 dials above ~50% of the viewer
  // height each instead of ~33%.
  const dagControls = document.querySelector('#vp-dag .panel-header .header-controls');
  if (dagControls) {
    const cbtn = document.createElement("button");
    cbtn.type = "button";
    cbtn.className = "hdr-btn dag-collapse-btn";
    cbtn.setAttribute("aria-pressed", state.dagCollapsed ? "true" : "false");
    cbtn.textContent = state.dagCollapsed ? "▴" : "▾";
    cbtn.title = "Collapse / expand";
    cbtn.addEventListener("click", () => setState({ dagCollapsed: !state.dagCollapsed }));
    dagControls.appendChild(cbtn);
  }
  applyDagCollapsed(state);
  onChange(applyDagCollapsed);

  // Generic UI feedback for the decorative viewport-header buttons. These
  // groups (Met/Sar/Exel · ancient/DE441/Δ · uniform/epicycle/equant ·
  // overlay/π) didn't have click handlers before — wiring them so each
  // click at least toggles the visual state. Functional effects on the
  // underlying renderers come in later phases.
  viewerEl.querySelectorAll(".panel-header .seg-control").forEach((sc) => {
    sc.addEventListener("click", (e) => {
      const btn = e.target.closest(".seg-btn");
      if (!btn) return;
      sc.querySelectorAll(".seg-btn").forEach((b) => {
        const on = b === btn;
        b.classList.toggle("active", on);
        b.setAttribute("aria-pressed", on ? "true" : "false");
      });
    });
  });
  viewerEl.querySelectorAll(".panel-header .hdr-btn[aria-pressed]").forEach((btn) => {
    if (btn.dataset.dag) return;                          // gear-DAG: wired in gear-dag.js
    if (btn.classList.contains("maximize-btn")) return;   // maximize: wired above
    if (btn.classList.contains("dag-collapse-btn")) return; // dag collapse: wired above
    btn.addEventListener("click", () => {
      const next = btn.getAttribute("aria-pressed") !== "true";
      btn.classList.toggle("active", next);
      btn.setAttribute("aria-pressed", next ? "true" : "false");
    });
  });

  // 10 dock panels
  mountStatePanel    (panel("state"),    state, onChange, bridge);
  mountEclipsesPanel (panel("eclipses"), state, onChange, bridge);
  mountReconPanel    (panel("recon"),    state, onChange, bridge);
  mountEphemPanel    (panel("ephem"),    state, onChange, bridge);
  mountHypothPanel   (panel("hypoth"),   state, onChange, bridge);
  mountOperatorPanel (panel("operator"), state, onChange, bridge);
  mountArchPanel     (panel("arch"),     state, onChange, bridge, setState);
  mountPairedPanel   (panel("paired"),   state, onChange, bridge);
  mountSeasonalPanel (panel("seasonal"), state, onChange, bridge);
  mountParetoPanel   (panel("pareto"),   state, onChange, bridge);

  // Dock tab switching
  dockEl.querySelectorAll(".dock-tab").forEach((tab) => {
    tab.addEventListener("click", () => {
      const t = tab.dataset.tab;
      dockEl.querySelectorAll(".dock-tab").forEach((b) =>
        b.classList.toggle("active", b.dataset.tab === t));
      dockEl.querySelectorAll(".dock-panel").forEach((p) =>
        p.classList.toggle("active", p.dataset.panel === t));
      setState({ dockTab: t });
    });
    if (tab.dataset.tab === state.dockTab) tab.click();
  });
  document.getElementById("dock-collapse").addEventListener("click", () => {
    dockEl.style.height = "";   // clear any drag-resized height first
    dockEl.classList.toggle("collapsed");
    setState({ dockCollapsed: dockEl.classList.contains("collapsed") });
  });

  // Drag-to-resize handle on the top edge of the dock. Drag up to grow,
  // down to shrink (clamped 80px..85vh). Double-click to reset to CSS default.
  installDockResizeHandle();

  // Mobile viewport selector (only used at narrow widths)
  buildMobileVpTabs();

  // Apply initial state to UI
  applyReconUI();
  applyRegimeUI();
}

const panel = (name) => document.querySelector(`.dock-panel[data-panel="${name}"]`);

function applyReconUI() {
  railEl.querySelectorAll("[data-recon]").forEach((b) =>
    b.classList.toggle("active", b.dataset.recon === state.recon));
}
function applyRegimeUI() {
  railEl.querySelectorAll("[data-regime]").forEach((b) =>
    b.classList.toggle("active", b.dataset.regime === state.regime));
}

/* ----- collapse the gear-DAG row (bottom of the viewer grid) ------------ */

function applyDagCollapsed(s) {
  viewerEl.classList.toggle("dag-collapsed", !!s.dagCollapsed);
  const btn = document.querySelector(".dag-collapse-btn");
  if (btn) {
    btn.textContent = s.dagCollapsed ? "▴" : "▾";
    btn.classList.toggle("active", !!s.dagCollapsed);
    btn.setAttribute("aria-pressed", s.dagCollapsed ? "true" : "false");
    btn.title = s.dagCollapsed ? "Expand" : "Collapse";
  }
}

/* ----- maximize / restore (one viewport fills the whole grid area) ------- */

function applyMaximized(s) {
  viewerEl.classList.toggle("has-maximized", !!s.maximized);
  viewerEl.querySelectorAll(".viewport").forEach((vp) => {
    const id = vp.id.replace("vp-", "");
    vp.classList.toggle("maximized", id === s.maximized);
  });
  document.querySelectorAll(".maximize-btn").forEach((b) => {
    const isActive = b.dataset.maxFor === s.maximized;
    b.classList.toggle("active", isActive);
    b.setAttribute("aria-pressed", isActive ? "true" : "false");
    b.title = isActive ? "Restore" : "Maximize";
  });
}

/* ----- drag-to-resize handle on the dock's top edge ---------------------- */

function installDockResizeHandle() {
  const handle = document.createElement("div");
  handle.className = "dock-resize-handle";
  handle.title = "Drag to resize · double-click to reset";
  dockEl.insertBefore(handle, dockEl.firstChild);

  let dragging = false, startY = 0, startH = 0;

  handle.addEventListener("pointerdown", (e) => {
    if (dockEl.classList.contains("collapsed")) return;
    dragging = true;
    startY = e.clientY;
    startH = dockEl.getBoundingClientRect().height;
    handle.setPointerCapture(e.pointerId);
    e.preventDefault();
  });
  handle.addEventListener("pointermove", (e) => {
    if (!dragging) return;
    const dy = startY - e.clientY;       // drag up to grow
    const newH = Math.max(80, Math.min(window.innerHeight * 0.85, startH + dy));
    dockEl.style.height = newH + "px";
  });
  const stop = (e) => {
    if (!dragging) return;
    dragging = false;
    try { handle.releasePointerCapture(e.pointerId); } catch (_) {}
  };
  handle.addEventListener("pointerup", stop);
  handle.addEventListener("pointercancel", stop);
  handle.addEventListener("dblclick", () => { dockEl.style.height = ""; });
}

/* ----- mobile single-pane switcher --------------------------------------- */

function buildMobileVpTabs() {
  const tabs = document.createElement("div");
  tabs.className = "mobile-vp-tabs";
  const vps = ["front", "back", "sky", "orrery", "dag"];
  for (const v of vps) {
    const b = document.createElement("button");
    b.textContent = v.toUpperCase();
    b.dataset.vp = v;
    if (v === state.view) b.classList.add("active");
    b.addEventListener("click", () => {
      tabs.querySelectorAll("button").forEach((x) => x.classList.toggle("active", x === b));
      document.querySelectorAll("#viewer .viewport").forEach((p) =>
        p.classList.toggle("mobile-active", p.id === `vp-${v}`));
      setState({ view: v });
    });
    tabs.appendChild(b);
  }
  viewerEl.insertBefore(tabs, viewerEl.firstChild);
  // Mark current focus as mobile-active for narrow widths.
  document.querySelectorAll("#viewer .viewport").forEach((p) =>
    p.classList.toggle("mobile-active", p.id === `vp-${state.view}`));
}

/* ----- help overlay ------------------------------------------------------- */

function toggleHelp() {
  const ov = document.getElementById("help-overlay");
  ov.hidden = !ov.hidden;
}

/* ----- go ----------------------------------------------------------------- */

window.addEventListener("hashchange", () => {
  // External hash changes (back/forward) are a no-op for v1; could re-read.
});

boot().catch((e) => {
  bootLog(`fatal: ${e.message}`, "fail");
  console.error(e);
});
