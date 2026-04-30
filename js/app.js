/* ------------------------------------------------------------------------- *
 * app.js — top-level state, viewport routing, hash sync, keyboard.
 * Loads the bridge (Pyodide + antikythera-spectral, with mock fallback),
 * then mounts the 5 viewports and 10 dock panels.
 * ------------------------------------------------------------------------- */

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

/* ----- canonical state ---------------------------------------------------- */

const REFERENCE_JD = 1684595;     // ~205 BCE, encoder reference epoch (notebook §3.2)
const TODAY_JD     = 2460800;     // 2025-05-01, close enough for the UI default
const JD_MIN       = 990558;      // ~2000 BCE
const JD_MAX       = 2487991;     // ~2100 CE

export const state = {
  jd: REFERENCE_JD,
  playing: false,
  speed: 365,                     // days per second
  regime: "intermittent",         // 'continuous' | 'intermittent'  (notebook §11.6.10)
  recon: "freeth2021",            // 'freeth2021' | 'wright' | 'price1974' | 'compare'
  arch: {                         // architectural-mode toggles (G-H4..G-H8)
    clutch:  false,
    setting: false,
    missing: false,
  },
  view: "front",                  // mobile single-pane focus
  observer: { lat: 35.86, lon: 23.31 }, // Antikythera island
  dockTab: "state",
  dockCollapsed: false,
};

/* ----- pub/sub: subscribers re-render when state changes ------------------ */

const subs = new Set();
export const onChange = (fn) => { subs.add(fn); return () => subs.delete(fn); };
export const setState = (patch) => {
  Object.assign(state, patch);
  if (patch.arch) state.arch = { ...state.arch, ...patch.arch };
  syncHash();
  for (const fn of subs) try { fn(state); } catch (e) { console.error(e); }
};

/* ----- URL hash <-> state -------------------------------------------------- */

function readHash() {
  const h = window.location.hash.replace(/^#/, "");
  if (!h) return;
  const params = new URLSearchParams(h);
  const jd = parseFloat(params.get("jd"));
  if (!Number.isNaN(jd)) state.jd = clamp(jd, JD_MIN, JD_MAX);
  const view = params.get("view");   if (view)   state.view = view;
  const recon = params.get("recon"); if (recon)  state.recon = recon;
  const reg = params.get("regime");  if (reg)    state.regime = reg;
  const tab = params.get("tab");     if (tab)    state.dockTab = tab;
}
let hashTimer = null;
function syncHash() {
  if (hashTimer) cancelAnimationFrame(hashTimer);
  hashTimer = requestAnimationFrame(() => {
    const p = new URLSearchParams();
    p.set("jd", state.jd.toFixed(1));
    p.set("view", state.view);
    p.set("recon", state.recon);
    p.set("regime", state.regime);
    p.set("tab", state.dockTab);
    history.replaceState(null, "", "#" + p.toString());
  });
}
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

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

  let bridgeReady = false;
  try {
    await bridge.boot();
    bridgeReady = true;
    bootLog("antikythera-spectral live", "ok");
  } catch (err) {
    bootLog(`pyodide boot failed: ${err.message}`, "fail");
    bootLog("falling back to JSON-ephemeris demo", "warn");
    await bridge.bootMock();
    bootLog("mock bridge active", "warn");
  }
  bootProgress(95, bridgeReady ? "live" : "demo");

  // Hand the bridge to the rest of the app.
  window.__ak = bridge;          // useful for console poking
  mountUI(bridge);

  bootProgress(100, bridgeReady ? "live" : "demo");
  // Reveal grid; hide boot.
  bootEl.hidden = true;
  viewerEl.hidden = false;
  dockEl.hidden = false;
  railEl.hidden = false;
  document.body.classList.remove("state-loading");
}

/* ----- mount everything once the bridge is ready -------------------------- */

function mountUI(bridge) {
  // HUD
  mountCalendars(document.getElementById("calendar-readout"), state, onChange, bridge);
  mountScrubber(railEl, state, setState, bridge);
  bindKeyboard(state, setState);

  // Topbar buttons
  document.getElementById("btn-today").addEventListener("click",
    () => setState({ jd: TODAY_JD }));
  document.getElementById("btn-epoch").addEventListener("click",
    () => setState({ jd: REFERENCE_JD }));
  document.getElementById("btn-help").addEventListener("click", toggleHelp);
  document.querySelector("#help-overlay")?.addEventListener("click",
    (e) => { if (e.target.id === "help-overlay") toggleHelp(); });

  // Reconstruction column buttons (left rail)
  railEl.querySelectorAll("[data-recon]").forEach(btn => {
    btn.addEventListener("click", () => {
      const recon = btn.dataset.recon;
      setState({ recon });
      railEl.querySelectorAll("[data-recon]").forEach(b =>
        b.classList.toggle("active", b.dataset.recon === recon));
    });
  });
  // Operation regime buttons
  railEl.querySelectorAll("[data-regime]").forEach(btn => {
    btn.addEventListener("click", () => {
      const regime = btn.dataset.regime;
      setState({ regime });
      railEl.querySelectorAll("[data-regime]").forEach(b =>
        b.classList.toggle("active", b.dataset.regime === regime));
    });
  });

  // 5 viewports
  mountFrontDial(document.querySelector('[data-host="front"]'),  state, onChange, bridge);
  mountBackDial (document.querySelector('[data-host="back"]'),   state, onChange, bridge);
  mountSkyView  (document.querySelector('[data-host="sky"]'),    state, onChange, bridge);
  mountOrrery   (document.querySelector('[data-host="orrery"]'), state, onChange, bridge);
  mountGearDag  (document.querySelector('[data-host="dag"]'),    state, onChange, bridge);

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
  dockEl.querySelectorAll(".dock-tab").forEach(tab => {
    tab.addEventListener("click", () => {
      const t = tab.dataset.tab;
      dockEl.querySelectorAll(".dock-tab").forEach(b =>
        b.classList.toggle("active", b.dataset.tab === t));
      dockEl.querySelectorAll(".dock-panel").forEach(p =>
        p.classList.toggle("active", p.dataset.panel === t));
      setState({ dockTab: t });
    });
    if (tab.dataset.tab === state.dockTab) tab.click();
  });
  document.getElementById("dock-collapse").addEventListener("click", () => {
    dockEl.classList.toggle("collapsed");
    setState({ dockCollapsed: dockEl.classList.contains("collapsed") });
  });

  // Mobile viewport selector (only used at narrow widths)
  buildMobileVpTabs();

  // Apply initial state to UI
  applyReconUI();
  applyRegimeUI();
}

const panel = (name) => document.querySelector(`.dock-panel[data-panel="${name}"]`);

function applyReconUI() {
  railEl.querySelectorAll("[data-recon]").forEach(b =>
    b.classList.toggle("active", b.dataset.recon === state.recon));
}
function applyRegimeUI() {
  railEl.querySelectorAll("[data-regime]").forEach(b =>
    b.classList.toggle("active", b.dataset.regime === state.regime));
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
      tabs.querySelectorAll("button").forEach(x => x.classList.toggle("active", x === b));
      document.querySelectorAll("#viewer .viewport").forEach(p =>
        p.classList.toggle("mobile-active", p.id === `vp-${v}`));
      setState({ view: v });
    });
    tabs.appendChild(b);
  }
  viewerEl.insertBefore(tabs, viewerEl.firstChild);
  // Mark current focus as mobile-active for narrow widths.
  document.querySelectorAll("#viewer .viewport").forEach(p =>
    p.classList.toggle("mobile-active", p.id === `vp-${state.view}`));
}

/* ----- help overlay ------------------------------------------------------- */

function toggleHelp() {
  const ov = document.getElementById("help-overlay");
  ov.hidden = !ov.hidden;
}

/* ----- play loop ---------------------------------------------------------- */

let playRaf = null;
let playPrev = 0;
export function setPlaying(v) {
  state.playing = v;
  cancelAnimationFrame(playRaf);
  if (!v) return;
  playPrev = performance.now();
  const tick = (t) => {
    const dt = (t - playPrev) / 1000;
    playPrev = t;
    setState({ jd: clamp(state.jd + dt * state.speed, JD_MIN, JD_MAX) });
    if (state.playing) playRaf = requestAnimationFrame(tick);
  };
  playRaf = requestAnimationFrame(tick);
}

/* ----- go ----------------------------------------------------------------- */

window.addEventListener("hashchange", () => {
  // External hash changes (back/forward) are a no-op for v1; could re-read.
});

boot().catch(e => {
  bootLog(`fatal: ${e.message}`, "fail");
  console.error(e);
});
