/* ------------------------------------------------------------------------- *
 * state.js — canonical state, pub/sub, hash sync, play loop.
 *
 * Lives in its own module so HUD modules (scrubber, keyboard) can import the
 * play/pause + subscription primitives without round-tripping through app.js
 * — that would create an ES-module cycle and the browser refuses to fully
 * evaluate the affected module graph.
 * ------------------------------------------------------------------------- */

export const REFERENCE_JD = 1684595;     // ~205 BCE, encoder reference epoch (notebook §3.2)
// The mechanism is HDC / modular arithmetic — `get_dial_state` is unbounded,
// so JD can be wherever the user wants. These bounds only exist as a safety
// rail against runaway play-loop drift. Calendar conversions and eclipse
// search degrade gracefully past their internal bounds (~±10000 yr): panels
// return empty results instead of breaking, and dial state stays correct.
export const JD_MIN       = -34850000;   // ~100000 BCE
export const JD_MAX       = 38400000;    // ~100000 CE

// JD for the current civil date, computed at boot so it stays fresh.
export function todayJD() {
  // Unix epoch (1970-01-01 00:00:00 UTC) is JD 2440587.5.
  return 2440587.5 + (Date.now() / 86400000);
}

export const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

/* ----- canonical state object -------------------------------------------- */

export const state = {
  jd: REFERENCE_JD,
  playing: false,
  speed: 365,                     // days per second
  regime: "intermittent",         // 'continuous' | 'intermittent'  (notebook §11.6.10)
  recon: "compare",               // 'freeth2021' | 'wright' | 'price1974' | 'compare'
  arch: {                         // architectural-mode toggles (G-H4..G-H8)
    clutch:  false,
    setting: false,
    missing: false,
  },
  view: "front",                  // mobile single-pane focus
  maximized: null,                // null | "front" | "back" | "sky" | "orrery" | "dag"
  dagCollapsed: false,            // collapse the bottom DAG row → 2×2 dials get more space
  orreryFrame: "helio",           // "geo" | "helio" — which reference frame the orrery uses
  observer: { lat: 35.86, lon: 23.31 }, // Antikythera island
  dockTab: "state",
  dockCollapsed: false,
};

/* ----- pub/sub: subscribers re-render when state changes ----------------- */

const subs = new Set();
export const onChange = (fn) => { subs.add(fn); return () => subs.delete(fn); };
export const setState = (patch) => {
  Object.assign(state, patch);
  if (patch.arch) state.arch = { ...state.arch, ...patch.arch };
  syncHash();
  for (const fn of subs) {
    try { fn(state); } catch (e) { console.error(e); }
  }
};

/* ----- URL hash <-> state ------------------------------------------------ */

export function readHash() {
  const h = window.location.hash.replace(/^#/, "");
  if (!h) return;
  const params = new URLSearchParams(h);
  const jd = parseFloat(params.get("jd"));
  if (!Number.isNaN(jd)) state.jd = clamp(jd, JD_MIN, JD_MAX);
  const view = params.get("view");   if (view)  state.view = view;
  const recon = params.get("recon"); if (recon) state.recon = recon;
  const reg = params.get("regime");  if (reg)   state.regime = reg;
  const tab = params.get("tab");     if (tab)   state.dockTab = tab;
  const max = params.get("max");     if (max)   state.maximized = max === "none" ? null : max;
  if (params.get("dagc") === "1") state.dagCollapsed = true;
  const orf = params.get("orf"); if (orf === "geo" || orf === "helio") state.orreryFrame = orf;
}

let hashTimer = null;
function syncHash() {
  // setTimeout instead of rAF: rAF is paused on hidden tabs (e.g. background
  // tabs, headless preview environments) which silently breaks hash sync;
  // setTimeout fires regardless, and 50 ms is plenty of debounce for the
  // play loop calling setState at 60 Hz.
  if (hashTimer) clearTimeout(hashTimer);
  hashTimer = setTimeout(() => {
    const p = new URLSearchParams();
    p.set("jd", state.jd.toFixed(1));
    p.set("view", state.view);
    p.set("recon", state.recon);
    p.set("regime", state.regime);
    p.set("tab", state.dockTab);
    if (state.maximized) p.set("max", state.maximized);
    if (state.dagCollapsed) p.set("dagc", "1");
    if (state.orreryFrame && state.orreryFrame !== "helio") p.set("orf", state.orreryFrame);
    history.replaceState(null, "", "#" + p.toString());
  }, 50);
}

/* ----- play loop --------------------------------------------------------- */

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
