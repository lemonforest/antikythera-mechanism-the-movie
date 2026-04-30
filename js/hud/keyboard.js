/* ------------------------------------------------------------------------- *
 * hud/keyboard.js — global keyboard shortcuts.
 *
 *   ←/→        ±1 day
 *   [ / ]      ±1 month (≈30 d)
 *   { / }      ±1 year  (≈365 d)
 *   Space      play / pause
 *   1–5        focus viewport (front · back · sky · orrery · DAG)
 *   C          toggle crank-as-clutch
 *   S          toggle setting-mode
 *   M          toggle missing-gear visibility
 *   R          reset to reference epoch
 *   O          open OPERATOR dock tab
 *   H          toggle help overlay
 *
 * Skipped when the user is typing in an input/textarea or holding a modifier
 * (so we don't steal browser shortcuts).
 * ------------------------------------------------------------------------- */

import { setPlaying, REFERENCE_JD } from "../state.js";
const VIEWS = ["front", "back", "sky", "orrery", "dag"];

export function bindKeyboard(state, setState) {
  document.addEventListener("keydown", (ev) => {
    if (ev.metaKey || ev.ctrlKey || ev.altKey) return;
    const t = ev.target;
    const tag = t && t.tagName;
    if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;

    const k = ev.key;
    let handled = true;

    switch (k) {
      case "ArrowLeft":  setState({ jd: state.jd - 1 });   break;
      case "ArrowRight": setState({ jd: state.jd + 1 });   break;
      case "[":          setState({ jd: state.jd - 30 });  break;
      case "]":          setState({ jd: state.jd + 30 });  break;
      case "{":          setState({ jd: state.jd - 365 }); break;
      case "}":          setState({ jd: state.jd + 365 }); break;
      case " ":
      case "Spacebar":
        setPlaying(!state.playing);
        break;
      case "1": case "2": case "3": case "4": case "5":
        setView(VIEWS[parseInt(k, 10) - 1], setState);
        break;
      case "c": case "C":
        setState({ arch: { ...state.arch, clutch: !state.arch.clutch } });
        break;
      case "s": case "S":
        setState({ arch: { ...state.arch, setting: !state.arch.setting } });
        break;
      case "m": case "M":
        setState({ arch: { ...state.arch, missing: !state.arch.missing } });
        break;
      case "r": case "R":
        setState({ jd: REFERENCE_JD });
        break;
      case "o": case "O":
        clickDockTab("operator");
        break;
      case "h": case "H":
      case "?":
        toggleHelp();
        break;
      default:
        handled = false;
    }

    if (handled) ev.preventDefault();
  });
}

function setView(view, setState) {
  if (!view) return;
  setState({ view });
  // Apply the .mobile-active class so the narrow-screen single-pane updates.
  document.querySelectorAll("#viewer .viewport").forEach((p) =>
    p.classList.toggle("mobile-active", p.id === `vp-${view}`));
  document.querySelectorAll(".mobile-vp-tabs button").forEach((b) =>
    b.classList.toggle("active", b.dataset.vp === view));
}

function clickDockTab(name) {
  const btn = document.querySelector(`.dock-tab[data-tab="${name}"]`);
  if (btn) btn.click();
}

function toggleHelp() {
  const ov = document.getElementById("help-overlay");
  if (ov) ov.hidden = !ov.hidden;
}
