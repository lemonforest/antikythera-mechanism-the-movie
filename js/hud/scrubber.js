/* ------------------------------------------------------------------------- *
 * hud/scrubber.js — left-rail time controls.
 *
 * The JD scrubber is a small floating window around the current JD
 * (±SCRUBBER_HALF_RANGE days). The window auto-recenters whenever JD
 * changes by anything other than the user dragging the slider itself —
 * so click ±yr / ±Met / Today / Epoch / type a year, and the slider
 * stays usable at high resolution.
 *
 * Why: the mechanism is HDC / modular — there's no meaningful "absolute"
 * JD position to point at. What's useful is fine scrubbing around your
 * current focus. ±20 yr at ~80 days/pixel is a comfortable Saros-scale
 * window; the buttons handle larger jumps.
 * ------------------------------------------------------------------------- */

import { setPlaying, onChange, SCRUBBER_HALF_RANGE, JD_MIN, JD_MAX } from "../state.js";

// Approximate Gregorian-year ↔ JD conversion (good enough for the year-jump
// input; calendar code in the bridge produces the authoritative readout).
const J2000 = 2451545.0;
const yearToJD = (year) => J2000 + (year - 2000) * 365.25;

export function mountScrubber(railEl, state, setState, _bridge) {
  if (!railEl) return;

  const scrubber = railEl.querySelector("#jd-scrubber");
  const readout  = railEl.querySelector("#jd-readout");
  const playBtn  = railEl.querySelector('[data-act="play"]');
  const backBtn  = railEl.querySelector('[data-act="back"]');
  const fwdBtn   = railEl.querySelector('[data-act="fwd"]');
  const speedSel = railEl.querySelector("#speed-sel");
  const stepBtns = railEl.querySelectorAll("[data-step]");
  const yearInp  = railEl.querySelector("#year-jump");
  const yearGo   = railEl.querySelector("#year-jump-go");

  let dragging = false;

  /* ---- input → state -------------------------------------------------- */

  if (scrubber) {
    setSliderWindow(state.jd);
    scrubber.addEventListener("input", () => {
      setState({ jd: parseFloat(scrubber.value) });
    });
    // Mark drag start/end so paint() knows whether to recenter the window.
    scrubber.addEventListener("pointerdown",   () => { dragging = true; });
    scrubber.addEventListener("pointerup",     () => { dragging = false; recenter(); });
    scrubber.addEventListener("pointercancel", () => { dragging = false; recenter(); });
    scrubber.addEventListener("blur",          () => { dragging = false; recenter(); });
  }

  if (playBtn) {
    playBtn.addEventListener("click", () => {
      const next = !state.playing;
      setPlaying(next);
      playBtn.textContent = next ? "❚❚" : "▶";
    });
  }

  backBtn?.addEventListener("click", () => setState({ jd: state.jd - 1 }));
  fwdBtn ?.addEventListener("click", () => setState({ jd: state.jd + 1 }));

  if (speedSel) {
    speedSel.value = String(state.speed);
    speedSel.addEventListener("change", () =>
      setState({ speed: parseFloat(speedSel.value) }));
  }

  stepBtns.forEach((b) => {
    b.addEventListener("click", () => {
      const dt = parseFloat(b.dataset.step);
      if (!Number.isNaN(dt)) setState({ jd: state.jd + dt });
    });
  });

  // Year-jump input: type a year, press Enter (or click ⏎) to warp the JD.
  // Negative numbers are BCE (proleptic Julian, e.g. -205 = 206 BCE).
  function jumpToYear() {
    if (!yearInp) return;
    const raw = yearInp.value.trim();
    if (!raw) return;
    const year = parseFloat(raw);
    if (Number.isNaN(year)) return;
    const jd = clamp(yearToJD(year), JD_MIN, JD_MAX);
    setState({ jd });
    yearInp.value = "";
    yearInp.blur();
  }
  yearInp?.addEventListener("keydown", (e) => {
    if (e.key === "Enter") { e.preventDefault(); jumpToYear(); }
  });
  yearGo?.addEventListener("click", jumpToYear);

  /* ---- state → UI ----------------------------------------------------- */

  function setSliderWindow(jd) {
    if (!scrubber) return;
    const lo = Math.max(JD_MIN, Math.round(jd - SCRUBBER_HALF_RANGE));
    const hi = Math.min(JD_MAX, Math.round(jd + SCRUBBER_HALF_RANGE));
    scrubber.min = String(lo);
    scrubber.max = String(hi);
    scrubber.value = String(Math.round(jd));
  }

  function recenter() {
    setSliderWindow(state.jd);
  }

  function paint(s) {
    if (scrubber) {
      if (dragging) {
        // Don't slide the window during a drag — keeps the thumb stable.
        scrubber.value = String(Math.round(s.jd));
      } else {
        setSliderWindow(s.jd);
      }
    }
    if (readout) readout.textContent = `JD ${s.jd.toFixed(1)}`;
    if (playBtn) playBtn.textContent = s.playing ? "❚❚" : "▶";
  }

  paint(state);
  onChange(paint);
}

function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }
