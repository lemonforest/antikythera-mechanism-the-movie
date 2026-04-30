/* ------------------------------------------------------------------------- *
 * hud/scrubber.js — left-rail time controls.
 *
 * Wires:
 *  - JD scrubber range input
 *  - play / pause + ±1d step buttons + speed selector + ±step grid
 *  - JD readout text
 * ------------------------------------------------------------------------- */

import { setPlaying, onChange } from "../state.js";

export function mountScrubber(railEl, state, setState, _bridge) {
  if (!railEl) return;

  const scrubber = railEl.querySelector("#jd-scrubber");
  const readout  = railEl.querySelector("#jd-readout");
  const playBtn  = railEl.querySelector('[data-act="play"]');
  const backBtn  = railEl.querySelector('[data-act="back"]');
  const fwdBtn   = railEl.querySelector('[data-act="fwd"]');
  const speedSel = railEl.querySelector("#speed-sel");
  const stepBtns = railEl.querySelectorAll("[data-step]");

  /* ---- input → state -------------------------------------------------- */

  if (scrubber) {
    scrubber.value = String(state.jd);
    scrubber.addEventListener("input", () => {
      setState({ jd: parseFloat(scrubber.value) });
    });
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

  /* ---- state → UI ----------------------------------------------------- */

  function paint(s) {
    if (scrubber && document.activeElement !== scrubber) {
      scrubber.value = String(Math.round(s.jd));
    }
    if (readout) readout.textContent = `JD ${s.jd.toFixed(1)}`;
    if (playBtn) playBtn.textContent = s.playing ? "❚❚" : "▶";
  }

  paint(state);
  onChange(paint);
}
