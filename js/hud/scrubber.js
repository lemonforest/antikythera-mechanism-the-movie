/* ------------------------------------------------------------------------- *
 * hud/scrubber.js — left-rail time controls.
 *
 * No slider any more. The mechanism is HDC; a 1D scalar slider was the
 * wrong shape for navigating its modular state. The step buttons (±d, ±mo,
 * ±yr, ±Met, ±Sar) are the navigation, plus a year-jump input for warps.
 *
 * Each step button is hold-to-repeat: tap = single increment, hold = an
 * initial increment + auto-repeat after a 350 ms delay at ~17 fires/sec.
 * Implemented with pointer events for unified mouse + touch handling.
 * ------------------------------------------------------------------------- */

import { setPlaying, onChange, JD_MIN, JD_MAX } from "../state.js";

// Approximate Gregorian-year ↔ JD conversion (good enough for the year-jump
// input; calendar code in the bridge produces the authoritative readout).
const J2000 = 2451545.0;
const yearToJD = (year) => J2000 + (year - 2000) * 365.25;

const HOLD_DELAY_MS  = 350;   // wait before auto-repeat starts
const HOLD_PERIOD_MS = 60;    // auto-repeat tick (~17/sec)

export function mountScrubber(railEl, state, setState, _bridge) {
  if (!railEl) return;

  const readout  = railEl.querySelector("#jd-readout");
  const playBtn  = railEl.querySelector('[data-act="play"]');
  const backBtn  = railEl.querySelector('[data-act="back"]');
  const fwdBtn   = railEl.querySelector('[data-act="fwd"]');
  const speedSel = railEl.querySelector("#speed-sel");
  const stepBtns = railEl.querySelectorAll("[data-step]");
  const yearInp  = railEl.querySelector("#year-jump");
  const yearGo   = railEl.querySelector("#year-jump-go");

  /* ---- play / pause / speed ------------------------------------------- */

  if (playBtn) {
    playBtn.addEventListener("click", () => {
      const next = !state.playing;
      setPlaying(next);
      playBtn.textContent = next ? "❚❚" : "▶";
    });
  }

  if (speedSel) {
    speedSel.value = String(state.speed);
    speedSel.addEventListener("change", () =>
      setState({ speed: parseFloat(speedSel.value) }));
  }

  /* ---- hold-to-repeat step buttons ------------------------------------ */

  if (backBtn) makeRepeatable(backBtn, () => setState({ jd: clamp(state.jd - 1) }));
  if (fwdBtn)  makeRepeatable(fwdBtn,  () => setState({ jd: clamp(state.jd + 1) }));

  stepBtns.forEach((b) => {
    const dt = parseFloat(b.dataset.step);
    if (Number.isNaN(dt)) return;
    makeRepeatable(b, () => setState({ jd: clamp(state.jd + dt) }));
  });

  /* ---- year-jump ------------------------------------------------------ */

  function jumpToYear() {
    if (!yearInp) return;
    const raw = yearInp.value.trim();
    if (!raw) return;
    const year = parseFloat(raw);
    if (Number.isNaN(year)) return;
    setState({ jd: clamp(yearToJD(year)) });
    yearInp.value = "";
    yearInp.blur();
  }
  yearInp?.addEventListener("keydown", (e) => {
    if (e.key === "Enter") { e.preventDefault(); jumpToYear(); }
  });
  yearGo?.addEventListener("click", jumpToYear);

  /* ---- state → UI ----------------------------------------------------- */

  function paint(s) {
    if (readout) readout.textContent = `JD ${s.jd.toFixed(1)}`;
    if (playBtn) playBtn.textContent = s.playing ? "❚❚" : "▶";
  }

  paint(state);
  onChange(paint);
}

function clamp(v) { return Math.max(JD_MIN, Math.min(JD_MAX, v)); }

/* ------------------------------------------------------------------------- *
 * Hold-to-repeat helper: pointerdown fires `fn` immediately, then after a
 * delay starts an auto-repeat. Pointerup / cancel / leave / blur stops it.
 * Keyboard (Enter/Space) fires `fn` once — no auto-repeat for a11y.
 * ------------------------------------------------------------------------- */

function makeRepeatable(btn, fn) {
  let delayTimer = null;
  let repeatTimer = null;

  const start = () => {
    fn();
    delayTimer = setTimeout(() => {
      repeatTimer = setInterval(fn, HOLD_PERIOD_MS);
    }, HOLD_DELAY_MS);
  };
  const stop = () => {
    if (delayTimer)  { clearTimeout(delayTimer);   delayTimer  = null; }
    if (repeatTimer) { clearInterval(repeatTimer); repeatTimer = null; }
  };

  btn.addEventListener("pointerdown", (e) => {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    e.preventDefault();
    btn.setPointerCapture?.(e.pointerId);
    start();
  });
  btn.addEventListener("pointerup",     stop);
  btn.addEventListener("pointercancel", stop);
  btn.addEventListener("pointerleave",  stop);
  btn.addEventListener("blur",          stop);

  // Keyboard activation — single fire, no auto-repeat (browsers already
  // handle key auto-repeat at the OS level via repeated keydown events).
  btn.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      fn();
    }
  });
}
