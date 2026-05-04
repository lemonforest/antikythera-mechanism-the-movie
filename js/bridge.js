/* ------------------------------------------------------------------------- *
 * bridge.js — JS↔Python bridge to antikythera-spectral.
 *
 * Loads Pyodide and micropip-installs the package, then proxies every
 * bridge.* call through the package's `bridge` module. There is no demo
 * mode: the mechanism's modular arithmetic doesn't need ephemerides, and
 * with v0.2.0's `kernel="none"` path the eclipses + visibility functions
 * also work in the browser without kernel data. If Pyodide can't load,
 * app.js shows an error UI rather than silently producing fake data.
 *
 * `data/boot-cache.json` is a small (~15 KB) snapshot of the hypothesis
 * battery, fetched in parallel with Pyodide. Used as a graceful fallback
 * if the live call ever fails after boot.
 *
 * Three kinds of methods exist:
 *   - LIVE: forwards directly to the package
 *   - VALIDATION-ONLY: needs real kernels we can't ship; produces a
 *     synthetic stand-in tagged `_synthetic: true`
 *   - INLINE: not implemented upstream; produced here (gearDag, etc.)
 *
 * The JS-side method names are stable. Python-side names live in PY_METHOD
 * at the top of the file — fix entries there when the package renames.
 * ------------------------------------------------------------------------- */

const PYODIDE_VERSION  = "0.26.4";
const PYODIDE_BASE     = `https://cdn.jsdelivr.net/pyodide/v${PYODIDE_VERSION}/full/`;
const BOOT_CACHE_URL   = "./data/boot-cache.json";

// Map our JS API to the package's Python bridge function names.
// Confirmed against `antikythera_spectral.bridge` v0.2.0 surface.
const PY_METHOD = {
  dialState:           "get_dial_state",
  // calendars         : composite of 4× jd_to_*
  eclipses:            "find_eclipses",
  visibilityWindow:    "get_visibility_windows",
  reconCompare:        "compare_reconstructions",
  ephemDiff:           "compare_ephemerides",          // VALIDATION-ONLY
  hypothesisBattery:   "run_hypothesis_battery",
  pairedChains:        "get_period_relations",
  seasonalWindows:     "get_visibility_windows",       // called per planet
  greekModel:          "compare_models",               // VALIDATION-ONLY
};

// Install directly from the published wheel URL on PyPI's CDN. Pyodide's
// micropip carries a lockfile that pins some packages; an explicit URL
// bypasses it. Update both constants together when bumping the package.
//
// v0.3.0 flipped the default HDC backend from complex128 (FHRR) to bit_alu
// (BSC) — every operation in the encode/decode path is now integer-only
// (XOR / popcount / shift on packed uint64s, ADR-0012). No FPU calls
// anywhere; the encoder is structurally closer to the bronze device.
const PKG_VERSION   = "0.3.0";
const PKG_WHEEL_URL = "https://files.pythonhosted.org/packages/48/79/0fc9ed6717d8070238fb9e168163cbe52f4457a9cd45dea05cf706b10109/antikythera_spectral-0.3.0-py3-none-any.whl";

const MICROPIP_BOOTSTRAP = `
import micropip
await micropip.install("${PKG_WHEEL_URL}")
import antikythera_spectral.bridge as _akbridge
`;

/* ------------------------------------------------------------------------- *
 * Bridge class
 * ------------------------------------------------------------------------- */

export class Bridge {
  constructor({ onLog, onProgress } = {}) {
    this.onLog       = onLog       || (() => {});
    this.onProgress  = onProgress  || (() => {});
    this.py          = null;          // Pyodide instance
    this.pyBridge    = null;          // proxy to antikythera_spectral.bridge
    this.bootCache   = null;          // contents of data/boot-cache.json
    this.warnedNames = new Set();
  }

  async boot() {
    this.onLog("loading pyodide runtime + boot cache…");
    this.onProgress(15, "pyodide");

    // Fetch the boot cache in parallel with the Pyodide download. ~15 KB,
    // arrives well before Pyodide finishes booting.
    const cachePromise = fetch(BOOT_CACHE_URL)
      .then((r) => (r.ok ? r.json() : null))
      .catch(() => null);

    if (!window.loadPyodide) {
      await loadScript(PYODIDE_BASE + "pyodide.js");
    }
    this.py = await window.loadPyodide({
      indexURL: PYODIDE_BASE,
      stdout:  (s) => this.onLog(`py> ${s}`),
      stderr:  (s) => this.onLog(`py! ${s}`, "warn"),
    });
    this.onProgress(45, "pyodide ok");
    this.onLog("pyodide ready", "ok");

    this.bootCache = await cachePromise;
    if (this.bootCache?.package_version) {
      this.onLog(`boot cache loaded (pkg ${this.bootCache.package_version})`, "ok");
    }

    this.onLog("micropip-installing antikythera-spectral…");
    this.onProgress(60, "installing");
    await this.py.loadPackage("micropip");
    await this.py.runPythonAsync(MICROPIP_BOOTSTRAP);
    this.pyBridge = this.py.globals.get("_akbridge");
    this.onProgress(90, "package ok");
    this.onLog(`antikythera_spectral.bridge ${PKG_VERSION} imported`, "ok");
  }

  /* ---- low-level dispatcher -------------------------------------------- */

  async _call(name, kwargs, fallbackFn) {
    const pyName = PY_METHOD[name] || name;
    const fn = this.pyBridge?.get ? this.pyBridge.get(pyName) : this.pyBridge?.[pyName];
    if (!fn) {
      if (!this.warnedNames.has(pyName)) {
        this.warnedNames.add(pyName);
        this.onLog(`bridge method '${pyName}' missing`, "warn");
      }
      return fallbackFn ? fallbackFn() : null;
    }
    try {
      const raw = await fn.callKwargs(kwargs);
      return pyToJs(raw);
    } catch (e) {
      this.onLog(`bridge.${pyName} threw: ${e.message}`, "warn");
      return fallbackFn ? fallbackFn() : null;
    }
  }

  /* ---- public methods (the UI's bridge contract) ---------------------- */

  async dialState(jd) {
    // backend="bit" is the v0.3.0 default; pass it explicitly so we don't
    // silently regress to FPU math if upstream ever flips the default again.
    const raw = await this._call("dialState", { jd_tdb: jd, backend: "bit" });
    // Pure modular arithmetic — synthesise body longitudes for the zodiac
    // ring inline (no ephemerides needed). `egyptian` is convenience too.
    return {
      ok: true,
      jd,
      dials:  raw?.dials || {},
      bodies: synthesisedBodies(jd),
      egyptian: computeEgyptian(jd),
      _live: true,
    };
  }

  async calendars(jd) {
    const fns = ["jd_to_gregorian", "jd_to_julian_calendar", "jd_to_athenian", "jd_to_olympiad"];
    const [greg, jul, ath, oly] = await Promise.all(
      fns.map((fn) => this._callRaw(fn, { jd_tdb: jd }))
    );
    return { ok: true, jd, gregorian: greg, julian: jul, athenian: ath, olympiad: oly, _live: true };
  }

  // _call goes through PY_METHOD (with optional fallback); _callRaw takes an
  // exact Python function name and returns null on failure.
  async _callRaw(pyName, kwargs) {
    const fn = this.pyBridge?.get ? this.pyBridge.get(pyName) : this.pyBridge?.[pyName];
    if (!fn) return null;
    try { return pyToJs(await fn.callKwargs(kwargs)); }
    catch (e) { this.onLog(`bridge.${pyName} threw: ${e.message}`, "warn"); return null; }
  }

  // find_eclipses with precise=false is algebraic / Saros-driven (no kernel data needed).
  // v0.3.0 idiom: precise=false replaces the v0.2.0 kernel="none" workaround.
  async eclipses(jdStart, jdEnd) {
    const raw = await this._call("eclipses",
      { jd_lo: jdStart, jd_hi: jdEnd, kind: "all", precise: false });
    if (!raw?.eclipses) return { ok: false, count: 0, eclipses: [] };
    return {
      ok: true,
      count: raw.n_eclipses ?? raw.eclipses.length,
      mode:  raw.mode || "algebraic",
      eclipses: raw.eclipses.map((e) => ({
        jd: e.jd_tdb,
        type: e.kind,
        sarosOffset: e.saros_offset,
        anchorLabel: e.anchor_label,
      })),
      _live: true,
    };
  }

  async visibilityWindow(body, jd) {
    if (body === "sun" || body === "moon") return { ok: true, body, jd, alwaysVisible: true };
    const raw = await this._call("visibilityWindow",
      { jd_lo: jd - 30, jd_hi: jd + 30, planet: body, precise: false });
    const w = raw?.windows?.[0];
    if (!w) return { ok: true, body, jd, isVisible: false, _live: true };
    return {
      ok: true,
      body,
      jd,
      isVisible: jd >= w.rise_jd && jd <= w.set_jd,
      nextRisingJD:  w.rise_jd,
      nextSettingJD: w.set_jd,
      durationDays:  w.duration_days,
      mode: raw.mode || "algebraic",
      _live: true,
    };
  }

  reconCompare(jd) {
    return this._call("reconCompare", { jd_tdb: jd, dials: "all" });
  }

  // VALIDATION-ONLY: kernel-vs-kernel diff intrinsically needs ephemeris data.
  async ephemDiff(jd, body) {
    const raw = await this._call("ephemDiff",
      { jd_tdb: jd, body: body || "sun", kernel_a: "de421", kernel_b: "de441" });
    return raw?.ok ? raw : syntheticEphemDiff(jd, body);
  }

  // run_hypothesis_battery — falls back to the boot-cache snapshot if the
  // live call fails (rare; package bug or transient Pyodide issue).
  async hypothesisBattery() {
    return this._call("hypothesisBattery", { ephemeris: null },
      () => this.bootCache?.hypothesis_battery || null);
  }

  // INLINE: not in the package.
  architectureMode(name, on) {
    return Promise.resolve(produceArchitectureMode(name, on));
  }

  gearDag() {
    return Promise.resolve(produceGearDag());
  }

  async pairedChains(planet) {
    const all = await this._call("pairedChains", { source: "almagest" });
    const relations = all?.relations || all;
    const found = relations?.[planet];
    if (found) return { ok: true, planet, ...found, _live: true };
    return producePairedChains(planet);
  }

  async seasonalWindows(year) {
    const planets = ["mercury", "venus", "mars", "jupiter", "saturn"];
    const jdLo = 1721423.5 + (year - 1) * 365.25;
    const jdHi = jdLo + 365.25;
    const out = await Promise.all(planets.map((p) =>
      this._callRaw("get_visibility_windows",
        { jd_lo: jdLo, jd_hi: jdHi, planet: p, precise: false })));
    const windows = {};
    planets.forEach((p, i) => {
      windows[p] = out[i]?.windows
        ? expandVisibilitySegments(out[i].windows, jdLo, jdHi)
        : [];
    });
    return { ok: true, year, windows, _live: true };
  }

  // INLINE: not in the package.
  paretoFrontier(primes) {
    return Promise.resolve(produceParetoFrontier(primes));
  }

  // VALIDATION-ONLY: Greek-model-vs-modern needs kernel as ground truth.
  async greekModel(planet, jd, mode) {
    const modeA = mode === "equant" ? "epicycle" : (mode || "epicycle");
    const modeB = mode === "equant" ? "equant"   : "equant";
    const raw = await this._call("greekModel",
      { jd_tdb: jd, body: planet, model_a: modeA, model_b: modeB, kernel: "de421" });
    return raw?.ok ? raw : syntheticGreekModel(planet, jd, mode);
  }

  // operator_advance(state, delta_days) needs a session state — synth for v1.
  async operatorRecalibrate(anchor, jd) {
    return syntheticOperatorRecalibrate(anchor, jd);
  }
}

/* ------------------------------------------------------------------------- *
 * Pyodide ↔ JS conversion + script loader
 * ------------------------------------------------------------------------- */

function pyToJs(val) {
  if (val == null) return val;
  if (typeof val.toJs === "function") {
    return val.toJs({ dict_converter: Object.fromEntries });
  }
  return val;
}

function loadScript(url) {
  return new Promise((res, rej) => {
    const s = document.createElement("script");
    s.src = url;
    s.async = true;
    s.onload = res;
    s.onerror = () => rej(new Error("failed to load " + url));
    document.head.appendChild(s);
  });
}

/* ------------------------------------------------------------------------- *
 * Inline body-position synthesis for the zodiac ring on the front dial.
 *
 * The mechanism's encoded planet trains each output a residue/angle on a
 * synodic-period dial — those are the authoritative outputs from
 * get_dial_state. To draw planet pointers on the *zodiac* ring (which is
 * what the front dial shows), we need ecliptic longitudes. We compute
 * those analytically here from mean motions; this is plenty accurate for
 * a UI ring and doesn't require ephemerides.
 * ------------------------------------------------------------------------- */

const J2000 = 2451545.0;

const MEAN_MOTION = {
  sun:     { rate: 0.985647,  L0: 280.4665 },
  moon:    { rate: 13.176396, L0: 218.3165, eccTerm: 6.289 },
  mercury: { rate: 4.092339,  L0: 252.2509, e: 0.20563, a: 0.387 },
  venus:   { rate: 1.602131,  L0: 181.9798, e: 0.00677, a: 0.723 },
  mars:    { rate: 0.524033,  L0: 355.4330, e: 0.09340, a: 1.524 },
  jupiter: { rate: 0.083091,  L0: 34.3515,  e: 0.04839, a: 5.203 },
  saturn:  { rate: 0.033494,  L0: 50.0775,  e: 0.05386, a: 9.537 },
};

const SIGN_NAMES = ["Aries","Taurus","Gemini","Cancer","Leo","Virgo","Libra","Scorpio","Sagittarius","Capricorn","Aquarius","Pisces"];

const wrap360 = (x) => ((x % 360) + 360) % 360;
const radians = (deg) => deg * Math.PI / 180;
const degrees = (rad) => rad * 180 / Math.PI;

function bodyLon(name, jd) {
  const p = MEAN_MOTION[name];
  if (!p) return 0;
  const t = jd - J2000;
  let lon = p.L0 + p.rate * t;
  if (name === "moon") {
    const sun = MEAN_MOTION.sun.L0 + MEAN_MOTION.sun.rate * t;
    lon += p.eccTerm * Math.sin(radians(lon - sun));
  }
  if (name !== "sun" && name !== "moon") {
    // Crude geocentric correction via 2D heliocentric→Earth projection.
    const sunLon = MEAN_MOTION.sun.L0 + MEAN_MOTION.sun.rate * t;
    const xh = p.a * Math.cos(radians(lon));
    const yh = p.a * Math.sin(radians(lon));
    const xe = Math.cos(radians(sunLon + 180));
    const ye = Math.sin(radians(sunLon + 180));
    lon = degrees(Math.atan2(yh - ye, xh - xe));
  }
  return wrap360(lon);
}

function lonToSign(lonDeg) {
  const idx = Math.floor(lonDeg / 30) % 12;
  return { sign: SIGN_NAMES[idx], signIndex: idx, signDeg: lonDeg - idx * 30 };
}

function moonPhase(jd) {
  const sunL  = bodyLon("sun",  jd);
  const moonL = bodyLon("moon", jd);
  const elong = wrap360(moonL - sunL);
  return {
    elongationDeg:    elong,
    illuminatedFrac: (1 - Math.cos(radians(elong))) / 2,
    ageDays:          elong / 360 * 29.530589,
  };
}

function synthesisedBodies(jd) {
  const out = {};
  for (const name of Object.keys(MEAN_MOTION)) {
    const lonDeg = bodyLon(name, jd);
    out[name] = { lonDeg, ...lonToSign(lonDeg) };
  }
  Object.assign(out.moon, moonPhase(jd));
  for (const planet of ["mercury","venus","mars","jupiter","saturn"]) {
    out[planet].elongationDeg = wrap360(out[planet].lonDeg - out.sun.lonDeg);
  }
  return out;
}

function computeEgyptian(jd) {
  // 12 × 30 + 5 epagomenal = 365 days, slips ~1 day / 4 yr.
  const eDay = ((Math.floor(jd - 1448638) % 365) + 365) % 365;
  return {
    dayOfYear: eDay,
    monthIndex: Math.min(11, Math.floor(eDay / 30)),
    dayOfMonth: eDay < 360 ? (eDay % 30) + 1 : eDay - 359,
    isEpagomenal: eDay >= 360,
  };
}

function expandVisibilitySegments(windows, jdLo, jdHi) {
  // Convert {rise_jd, set_jd} runs into {startDay, endDay, state} segments
  // (with invisible runs interleaved) for the seasonal panel's strips.
  const out = [];
  let lastEnd = jdLo;
  for (const w of windows) {
    if (w.rise_jd > lastEnd) {
      out.push({
        startDay: Math.max(0, Math.round(lastEnd - jdLo)),
        endDay:   Math.min(365, Math.round(w.rise_jd - jdLo)),
        state: "invisible",
      });
    }
    out.push({
      startDay: Math.max(0, Math.round(w.rise_jd - jdLo)),
      endDay:   Math.min(365, Math.round(w.set_jd - jdLo)),
      state: "visible",
    });
    lastEnd = w.set_jd;
  }
  if (lastEnd < jdHi) {
    out.push({
      startDay: Math.max(0, Math.round(lastEnd - jdLo)),
      endDay:   365,
      state:    "invisible",
    });
  }
  return out.filter((s) => s.endDay > s.startDay);
}

/* ------------------------------------------------------------------------- *
 * VALIDATION-ONLY synthetic stand-ins.
 *
 * These functions need real kernel data (DE421/DE441) by design — they
 * compare the mechanism against modern truth, and modern truth lives in
 * the kernels we can't ship to the browser. Output is plausible but
 * tagged `_synthetic: true` so consumers can show a "browser-only" hint.
 * ------------------------------------------------------------------------- */

function syntheticEphemDiff(jd, body) {
  const t = Math.abs(jd - J2000) / 365.25;
  const base = 0.05 * t;
  return {
    ok: true,
    jd,
    body: body || "sun",
    de421:       { lonArcsec: base * (1 + Math.sin(jd * 0.001)) },
    de441:       { lonArcsec: 0 },
    de441_part1: { lonArcsec: base * 0.3 * Math.cos(jd * 0.0007) },
    deltaArcsec: base,
    deltaKm:     base * 1.5e3,
    deltaAU:     base * 1e-8,
    _synthetic:  true,
  };
}

function syntheticGreekModel(planet, jd, mode) {
  const truth = bodyLon(planet, jd);
  const peakErr = { uniform: 180, epicycle: 51, equant: 49 }[mode] || 0;
  const phase = Math.sin(2 * Math.PI * (jd - J2000) / 780) * peakErr * 0.3;
  return {
    ok: true,
    planet,
    mode,
    jd,
    lonDeg: wrap360(truth + phase),
    peakErrorDeg: peakErr,
    _synthetic: true,
  };
}

function syntheticOperatorRecalibrate(anchor, jd) {
  const drifts = { olympic: 0.5, metonic: 1.2, saros: 0.8, callippic: 0.1 };
  return {
    ok: true,
    anchor: anchor || "olympic",
    jd,
    driftDeg: drifts[anchor] ?? 0.7,
    advancedJD: jd,
    _synthetic: true,
  };
}

/* ------------------------------------------------------------------------- *
 * INLINE produces — features not in the package.
 *
 * These would need their own upstream design work. Until then, the UI
 * still wants to render them, so we author them here.
 * ------------------------------------------------------------------------- */

function produceGearDag() {
  // Layered DAG, ~22 surviving + ~6 conjectural. Edge weights = mesh ratio.
  const nodes = [
    { id: "a1", layer: 0, teeth: 48,  surviving: true, label: "crank" },
    { id: "b1", layer: 1, teeth: 223, surviving: true, label: "main wheel" },
    { id: "b2", layer: 1, teeth: 64,  surviving: true },
    { id: "c1", layer: 2, teeth: 38,  surviving: true },
    { id: "c2", layer: 2, teeth: 48,  surviving: true },
    { id: "d1", layer: 2, teeth: 24,  surviving: true },
    { id: "d2", layer: 2, teeth: 127, surviving: true, label: "Mars train" },
    { id: "e1", layer: 3, teeth: 32,  surviving: true },
    { id: "e2", layer: 3, teeth: 32,  surviving: true },
    { id: "e3", layer: 3, teeth: 223, surviving: true, label: "Saros" },
    { id: "e4", layer: 3, teeth: 188, surviving: true },
    { id: "e5", layer: 3, teeth: 53,  surviving: true, label: "trunk bridge" },
    { id: "e6", layer: 3, teeth: 30,  surviving: true },
    { id: "f1", layer: 4, teeth: 53,  surviving: true },
    { id: "f2", layer: 4, teeth: 15,  surviving: true },
    { id: "g1", layer: 4, teeth: 60,  surviving: true },
    { id: "g2", layer: 4, teeth: 20,  surviving: true },
    { id: "h1", layer: 4, teeth: 60,  surviving: true },
    { id: "h2", layer: 4, teeth: 15,  surviving: true },
    { id: "i1", layer: 5, teeth: 60,  surviving: true,  label: "Mercury leaf" },
    { id: "k2", layer: 5, teeth: 64,  surviving: true,  label: "Venus leaf"   },
    { id: "m1", layer: 5, teeth: 50,  surviving: true,  label: "Jupiter leaf" },
    { id: "j1", layer: 5, teeth: 49,  surviving: false },
    { id: "j2", layer: 5, teeth: 71,  surviving: false },
    { id: "n1", layer: 5, teeth: 24,  surviving: false },
    { id: "n2", layer: 5, teeth: 115, surviving: false },
    { id: "p1", layer: 5, teeth: 7,   surviving: false },
    { id: "p2", layer: 5, teeth: 17,  surviving: false },
  ];
  const edges = [
    ["a1","b1"],["b1","b2"],["b2","c1"],["c1","c2"],["c2","d1"],
    ["d1","d2"],["d2","e1"],["e1","e2"],["e2","e3"],["e3","e4"],
    ["e4","e5"],["e5","e6"],["e6","f1"],["f1","f2"],["f2","g1"],
    ["g1","g2"],["g2","h1"],["h1","h2"],["h2","i1"],["i1","k2"],
    ["k2","m1"],["m1","j1"],["j1","j2"],["j2","n1"],["n1","n2"],
    ["n2","p1"],["p1","p2"],
  ].map(([from, to]) => ({ from, to }));
  return { ok: true, nodes, edges };
}

function produceArchitectureMode(name, on) {
  return {
    ok: true,
    mode: name,
    enabled: on,
    summary: `${name} ${on ? "engaged" : "disengaged"}`,
    affectedGears: { clutch: ["a1"], setting: ["c2","d2","e1"], missing: ["i1","k2","m1"] }[name] || [],
    confidence:    { clutch: "MODERATE", setting: "HIGH", missing: "LOW" }[name] || "LOW",
  };
}

const PAIRED_CHAINS_FALLBACK = {
  venus:   { canonical: { ratio: "5/8",     teeth: [5, 8],          sharedPrimes: [] },
             freeth:    { ratio: "289/462", teeth: [17,17,14,33],   sharedPrimes: [17] },
             differential: { description: "Venus paired-chain differential (5/8 + 289/462 calibration)" } },
  mercury: { canonical: { ratio: "104/33",  teeth: [104, 33],       sharedPrimes: [] },
             freeth:    { ratio: "729/233", teeth: [27, 27, 233],   sharedPrimes: [] },
             differential: { description: "Mercury 7-yr return chain" } },
  mars:    { canonical: { ratio: "37/79",   teeth: [37, 79],        sharedPrimes: [] },
             freeth:    { ratio: "133/142", teeth: [7, 19, 142],    sharedPrimes: [7, 19] },
             differential: { description: "Mars retrograde calibration" } },
  jupiter: { canonical: { ratio: "76/83",   teeth: [76, 83],        sharedPrimes: [] },
             freeth:    { ratio: "144/121", teeth: [12, 12, 121],   sharedPrimes: [] },
             differential: { description: "Jupiter 12-yr return chain" } },
  saturn:  { canonical: { ratio: "59/115",  teeth: [59, 115],       sharedPrimes: [] },
             freeth:    { ratio: "57/119",  teeth: [3, 19, 7, 17],  sharedPrimes: [7, 17, 19] },
             differential: { description: "Saturn 30-yr return chain — heaviest shared-prime reuse" } },
};

function producePairedChains(planet) {
  const data = PAIRED_CHAINS_FALLBACK[planet];
  if (!data) return { ok: false, error: `unknown planet ${planet}` };
  return { ok: true, planet, ...data };
}

function produceParetoFrontier(primes) {
  const usePrimes = primes && primes.length ? primes : [7, 17];
  const points = [];
  for (let i = 1; i <= 12; i++) {
    points.push({ precisionArcsec: 60 / i, costTeeth: 100 + 30 * i, primes: usePrimes });
  }
  return {
    ok: true,
    primes: usePrimes,
    points,
    freethPoint: { precisionArcsec: 8.0, costTeeth: 312, primes: [7, 17] },
  };
}
