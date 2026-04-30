/* ------------------------------------------------------------------------- *
 * bridge.js — JS↔Python bridge to antikythera-spectral.
 *
 * Live mode: loads Pyodide, micropip-installs antikythera-spectral, and
 * proxies every bridge.* call through the package's `bridge` module.
 *
 * Mock mode: fetches data/fallback-ephemeris.json (or synthesizes one in
 * memory) and answers each method with simplified Keplerian math + cached
 * tables. Enough for the UI to render plausibly without network/Pyodide.
 *
 * The JS-side API names are stable (used by every viewport/panel). The
 * Python-side names are looked up via PY_METHOD; fix entries there if the
 * package renames anything upstream.
 * ------------------------------------------------------------------------- */

const PYODIDE_VERSION  = "0.26.4";
const PYODIDE_BASE     = `https://cdn.jsdelivr.net/pyodide/v${PYODIDE_VERSION}/full/`;
const FALLBACK_URL     = "./data/fallback-ephemeris.ndjson";

// Map our JS API to the package's Python bridge function names.
// Confirmed against `antikythera_spectral.bridge` v0.1.0 surface.
// Some JS methods compose multiple Python calls — see _call/calendars below.
const PY_METHOD = {
  dialState:           "get_dial_state",
  // calendars         : composite (4× jd_to_*)
  eclipses:            "find_eclipses",
  visibilityWindow:    "get_visibility_windows",
  reconCompare:        "compare_reconstructions",
  ephemDiff:           "compare_ephemerides",
  hypothesisBattery:   "run_hypothesis_battery",
  // architectureMode  : not yet in package — mock-only
  // gearDag           : derived from DIAL_SPECS — mock-only for v1
  pairedChains:        "get_period_relations",
  seasonalWindows:     "get_visibility_windows",   // called per planet
  // paretoFrontier    : not yet in package — mock-only
  greekModel:          "compare_models",
  operatorRecalibrate: "operator_advance",
};

// Install directly from the published wheel URL on PyPI's CDN. Pyodide's
// micropip carries a lockfile that pins some packages to older versions
// (and `micropip.install("antikythera-spectral==0.2.0")` errors with
// "Can't find a pure Python 3 wheel" because the lockfile entry overrides
// the resolver). Direct-URL install bypasses the lockfile entirely.
// Update PKG_VERSION + PKG_WHEEL_URL together when bumping the package.
const PKG_VERSION   = "0.2.0";
const PKG_WHEEL_URL = "https://files.pythonhosted.org/packages/9a/13/f55c7367e4a77e042e8ad6083f3fa160fe5c42c708785f00bd870f45ebb9/antikythera_spectral-0.2.0-py3-none-any.whl";

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
    this.mode        = null;          // "live" | "mock"
    this.py          = null;          // Pyodide instance
    this.pyBridge    = null;          // proxy to antikythera_spectral.bridge
    this.fallback    = null;          // mock JSON payload
    this.warnedNames = new Set();
  }

  /* ---- live boot (Pyodide + micropip) ---------------------------------- */

  async boot() {
    this.onLog("loading pyodide runtime…");
    this.onProgress(15, "pyodide");

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

    this.onLog("micropip-installing antikythera-spectral…");
    this.onProgress(60, "installing");
    await this.py.loadPackage("micropip");
    await this.py.runPythonAsync(MICROPIP_BOOTSTRAP);
    this.pyBridge = this.py.globals.get("_akbridge");
    this.onProgress(90, "package ok");
    this.onLog("antikythera_spectral.bridge imported", "ok");

    this.mode = "live";
  }

  /* ---- mock boot (NDJSON fallback) ------------------------------------- */

  async bootMock() {
    this.onLog("loading fallback NDJSON ephemeris…");
    this.onProgress(70, "ndjson fallback");
    try {
      const res = await fetch(FALLBACK_URL);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      this.fallback = await parseNdjsonStream(res);
      this.onLog(`fallback loaded (${this.fallback.samples.length} samples · ${this.fallback.dial_names?.length || 0} dials)`, "ok");
    } catch (e) {
      this.onLog(`fallback fetch failed (${e.message}); synthesizing`, "warn");
      this.fallback = synthesizeFallback();
    }
    this.mode = "mock";
  }

  /* ---- dispatcher ------------------------------------------------------ */

  async _call(name, kwargs, mockFn) {
    if (this.mode === "live") {
      const pyName = PY_METHOD[name] || name;
      const fn = this.pyBridge.get ? this.pyBridge.get(pyName) : this.pyBridge[pyName];
      if (!fn) {
        if (!this.warnedNames.has(pyName)) {
          this.warnedNames.add(pyName);
          this.onLog(`bridge method '${pyName}' missing — using mock`, "warn");
        }
        return mockFn();
      }
      try {
        const raw = await fn.callKwargs(kwargs);
        return pyToJs(raw);
      } catch (e) {
        this.onLog(`bridge.${pyName} threw: ${e.message} — using mock`, "warn");
        return mockFn();
      }
    }
    return mockFn();
  }

  /* ---- 14 public JS methods (the UI's bridge contract) ----------------- */

  async dialState(jd) {
    // Live mode: real dials from package + body longitudes synthesized for
    //            the zodiac ring (deferred until a proper bridge call exists).
    // Mock mode: synthesizer produces the same composite shape.
    if (this.mode === "live") {
      const dials = await this._raw("get_dial_state", { jd_tdb: jd }, () => null);
      const bodies = synthesizedBodies(jd);
      const calendarBits = mockCalendarBits(jd);  // only the egyptian/metonic-cell helpers
      return { ok: true, jd, dials: dials?.dials || {}, bodies, ...calendarBits, _live: true };
    }
    return mockDialState(jd, this.fallback);
  }

  async calendars(jd) {
    // Composite of 4 jd_to_* calls.
    if (this.mode === "live") {
      const [greg, jul, ath, oly] = await Promise.all([
        this._raw("jd_to_gregorian",        { jd_tdb: jd }, () => mockGregorian(jd)),
        this._raw("jd_to_julian_calendar",  { jd_tdb: jd }, () => mockJulian(jd)),
        this._raw("jd_to_athenian",         { jd_tdb: jd }, () => mockAthenian(jd)),
        this._raw("jd_to_olympiad",         { jd_tdb: jd }, () => mockOlympiad(jd)),
      ]);
      return { ok: true, jd, gregorian: greg, julian: jul, athenian: ath, olympiad: oly, _live: true };
    }
    return mockCalendars(jd);
  }

  // find_eclipses(jd_lo, jd_hi, *, kind, kernel) — package v0.2.0 added an
  // algebraic / Saros-driven path triggered by kernel="none", which works in
  // the browser without any kernel data.
  async eclipses(jdStart, jdEnd) {
    const raw = await this._call("eclipses", { jd_lo: jdStart, jd_hi: jdEnd, kind: "all", kernel: "none" },
      () => null);
    if (!raw || !raw.eclipses) return mockEclipses(jdStart, jdEnd);
    return {
      ok: true,
      count: raw.n_eclipses ?? raw.eclipses.length,
      eclipses: raw.eclipses.map((e) => ({
        jd: e.jd_tdb,
        type: e.kind,
        sarosOffset: e.saros_offset,
        anchorLabel: e.anchor_label,
        // No magnitude in algebraic mode — that needs a real kernel.
      })),
      mode: raw.mode || "algebraic",
      _live: true,
    };
  }

  // get_visibility_windows(jd_lo, jd_hi, planet, kernel) — also gets an
  // algebraic path in v0.2.0 via kernel="none".
  async visibilityWindow(body, jd) {
    if (body === "sun" || body === "moon") return mockVisibilityWindow(body, jd);
    const raw = await this._call("visibilityWindow",
      { jd_lo: jd - 30, jd_hi: jd + 30, planet: body, kernel: "none" },
      () => null);
    if (!raw || !raw.windows) return mockVisibilityWindow(body, jd);
    const w = raw.windows[0];
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

  // compare_reconstructions(jd_tdb, *, dials='all')
  reconCompare(jd) {
    return this._call("reconCompare", { jd_tdb: jd, dials: "all" }, () => mockReconCompare(jd));
  }

  // compare_ephemerides(jd_tdb, body, kernel_a, kernel_b)
  ephemDiff(jd, body) {
    return this._call("ephemDiff", { jd_tdb: jd, body: body || "sun", kernel_a: "de421", kernel_b: "de441" },
      () => mockEphemDiff(jd, body));
  }

  // run_hypothesis_battery(*, ephemeris=None)
  hypothesisBattery(opts = {}) {
    return this._call("hypothesisBattery", { ephemeris: opts.kernel || null },
      () => mockHypothesisBattery(opts, this.fallback));
  }

  // Not in package — mock-only.
  architectureMode(name, on, jd) {
    return Promise.resolve(mockArchitectureMode(name, on, jd, this.fallback));
  }
  gearDag() {
    return Promise.resolve(mockGearDag());
  }

  // get_period_relations(source='almagest') returns all bodies; we filter.
  async pairedChains(planet) {
    if (this.mode !== "live") return mockPairedChains(planet);
    const all = await this._raw("get_period_relations", { source: "almagest" }, () => null);
    const relations = all?.relations || all;
    const found = relations && relations[planet];
    return found
      ? { ok: true, planet, ...found, _live: true }
      : mockPairedChains(planet);
  }

  // Composite: per-planet visibility across one year. v0.2.0 algebraic mode.
  async seasonalWindows(year) {
    if (this.mode !== "live") return mockSeasonalWindows(year);
    const planets = ["mercury", "venus", "mars", "jupiter", "saturn"];
    // Convert year → JD range. Approx Jan 1 = JD 1721423.5 + (year - 1) * 365.25.
    const jdLo = 1721423.5 + (year - 1) * 365.25;
    const jdHi = jdLo + 365.25;
    const out = await Promise.all(planets.map((p) =>
      this._raw("get_visibility_windows", { jd_lo: jdLo, jd_hi: jdHi, planet: p, kernel: "none" },
        () => null)
    ));
    const windows = {};
    const fallback = mockSeasonalWindows(year).windows;
    planets.forEach((p, i) => {
      const raw = out[i];
      if (raw?.windows?.length) {
        // Convert {rise_jd, set_jd, duration_days} → {startDay, endDay, state}
        // relative to year start, plus interleaved invisibility runs.
        const segments = [];
        let lastEnd = jdLo;
        for (const w of raw.windows) {
          if (w.rise_jd > lastEnd) {
            segments.push({
              startDay: Math.max(0, Math.round(lastEnd - jdLo)),
              endDay:   Math.min(365, Math.round(w.rise_jd - jdLo)),
              state:    "invisible",
            });
          }
          segments.push({
            startDay: Math.max(0, Math.round(w.rise_jd - jdLo)),
            endDay:   Math.min(365, Math.round(w.set_jd - jdLo)),
            state:    "visible",
          });
          lastEnd = w.set_jd;
        }
        if (lastEnd < jdHi) {
          segments.push({
            startDay: Math.max(0, Math.round(lastEnd - jdLo)),
            endDay:   365,
            state:    "invisible",
          });
        }
        windows[p] = segments.filter((s) => s.endDay > s.startDay);
      } else {
        windows[p] = fallback[p];
      }
    });
    return { ok: true, year, windows, _live: true };
  }

  // Not in package — mock-only.
  paretoFrontier(primes) {
    return Promise.resolve(mockParetoFrontier(primes));
  }

  // compare_models(jd_tdb, body, model_a, model_b, kernel)
  // Map our `mode` choice to (uniform / epicycle / equant) by always pairing
  // against `equant` for the (peak-error) reference comparison.
  greekModel(planet, jd, mode) {
    const modeA = mode === "equant" ? "epicycle" : mode || "epicycle";
    const modeB = mode === "equant" ? "equant"   : "equant";
    return this._call("greekModel", { jd_tdb: jd, body: planet, model_a: modeA, model_b: modeB, kernel: "de421" },
      () => mockGreekModel(planet, jd, mode));
  }

  // operator_advance(state, delta_days) needs a session state; mock for v1.
  operatorRecalibrate(anchor, jd) {
    return Promise.resolve(mockOperatorRecalibrate(anchor, jd));
  }

  /* ---- low-level: call any Python bridge function by name -------------- */

  async _raw(pyName, kwargs, fallbackFn) {
    if (this.mode !== "live") return fallbackFn ? fallbackFn() : null;
    const fn = this.pyBridge.get ? this.pyBridge.get(pyName) : this.pyBridge[pyName];
    if (!fn) {
      if (!this.warnedNames.has(pyName)) {
        this.warnedNames.add(pyName);
        this.onLog(`bridge method '${pyName}' missing — using fallback`, "warn");
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
}

/* ------------------------------------------------------------------------- *
 * Pyodide ↔ JS conversion (deep)
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

/* ---- NDJSON streaming parser ----------------------------------------- *
 * Reads response body as a stream, splits on newlines, parses each line.
 * Records are tagged with `t`: "meta" | "battery" | "sample".
 * Returns the assembled fallback object.
 * ------------------------------------------------------------------------- */

async function parseNdjsonStream(response) {
  const out = {
    samples: [],
    dial_names: null,
    dials: null,
    hypothesis_battery: null,
    jd_center: null,
    jd_half_window: null,
    jd_step: null,
  };
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buf = "";

  const handleLine = (raw) => {
    const line = raw.trim();
    if (!line) return;
    let rec;
    try { rec = JSON.parse(line); } catch (e) { return; }  // skip malformed
    if (rec.t === "meta") {
      out.dial_names = rec.dial_names;
      out.dials = rec.dials;
      out.jd_center = rec.jd_center;
      out.jd_half_window = rec.jd_half_window;
      out.jd_step = rec.jd_step;
    } else if (rec.t === "battery") {
      out.hypothesis_battery = rec;
    } else if (rec.t === "sample") {
      out.samples.push({ jd: rec.jd, r: rec.r, a: rec.a });
    }
  };

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    let nl;
    while ((nl = buf.indexOf("\n")) !== -1) {
      handleLine(buf.slice(0, nl));
      buf = buf.slice(nl + 1);
    }
  }
  if (buf) handleLine(buf);
  return out;
}

/* ------------------------------------------------------------------------- *
 * Mock implementations — simplified, plausibility-first.
 *
 * The math here is deliberately rough: simplified mean motions in a J2000
 * frame, no nutation, no perturbations. Goal is: dials move at the right
 * rate, eclipses cluster on Saros boundaries, calendars line up roughly.
 * Real accuracy comes from live mode.
 * ------------------------------------------------------------------------- */

const J2000 = 2451545.0;

// Mean motion (deg/day) and longitude at J2000 (deg) for the 7 classical bodies.
// Sun and Moon are geocentric mean longitudes; planets are heliocentric mean
// longitudes for which we apply a crude Earth-relative correction below.
const MEAN_MOTION = {
  sun:     { rate: 0.985647,  L0: 280.4665 },                  // 360/365.25
  moon:    { rate: 13.176396, L0: 218.3165, eccTerm: 6.289 },  // dominant elongation perturbation
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
    // crude evection-like wobble so the moon doesn't move at constant rate
    const sun = p.L0 + MEAN_MOTION.sun.rate * t;
    const D = lon - sun;
    lon += p.eccTerm * Math.sin(radians(D));
  }
  if (name !== "sun" && name !== "moon") {
    // crude geocentric correction: project planet's heliocentric longitude
    // through Earth's motion. Better than nothing for a UI mock.
    const sunLon = MEAN_MOTION.sun.L0 + MEAN_MOTION.sun.rate * t;
    const helio = lon;
    // 2-vector heliocentric position
    const xh = p.a * Math.cos(radians(helio));
    const yh = p.a * Math.sin(radians(helio));
    const xe = Math.cos(radians(sunLon + 180));
    const ye = Math.sin(radians(sunLon + 180));
    const dx = xh - xe;
    const dy = yh - ye;
    lon = degrees(Math.atan2(dy, dx));
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
  const phase = (1 - Math.cos(radians(elong))) / 2;     // 0=new, 1=full
  const ageDays = elong / 360 * 29.530589;
  return { elongationDeg: elong, illuminatedFrac: phase, ageDays };
}

/* ---- mockDialState --------------------------------------------------- */

// 13-dial spec, mirrors antikythera_spectral.bridge.DIAL_SPECS.
const DIAL_SPECS = [
  { name: "Metonic",                               modulus: 235, cyclePeriodDays: 6939.688382335 },
  { name: "Callippic",                             modulus: 940, cyclePeriodDays: 27758.75352934 },
  { name: "Olympic",                               modulus: 4,   cyclePeriodDays: 1460.96876 },
  { name: "Saros",                                 modulus: 223, cyclePeriodDays: 6585.321316003 },
  { name: "Exeligmos",                             modulus: 669, cyclePeriodDays: 19755.963948 },
  { name: "SiderealMonth",                         modulus: 254, cyclePeriodDays: 6939.70164 },
  { name: "DraconicMonth",                         modulus: 242, cyclePeriodDays: 6585.357240 },
  { name: "LunarAnomaly",                          modulus: 251, cyclePeriodDays: 6916.19205 },
  { name: "Mercury_synodic_period_relation",       modulus: 145, cyclePeriodDays: 13884.0 },
  { name: "Venus_synodic_period_relation",         modulus: 289, cyclePeriodDays: 168780.0 },
  { name: "Mars_synodic_period_relation",          modulus: 133, cyclePeriodDays: 103740.0 },
  { name: "Jupiter_synodic_period_relation",       modulus: 79,  cyclePeriodDays: 31518.0 },
  { name: "Saturn_synodic_period_relation",        modulus: 83,  cyclePeriodDays: 31010.0 },
];

function synthesizeDials(jd) {
  // anchor = REFERENCE_JD; D = days since anchor (rounded for residue math)
  const anchor = 1684595.0;
  const D = jd - anchor;
  const dials = {};
  for (const spec of DIAL_SPECS) {
    const cyclePeriod = spec.cyclePeriodDays;
    const cyclePos = (D / cyclePeriod) % 1;
    const wrapped = (cyclePos + 1) % 1;
    const angleDeg = wrapped * 360;
    const residue = Math.floor(wrapped * spec.modulus) % spec.modulus;
    dials[spec.name] = {
      residue,
      modulus: spec.modulus,
      angle_deg: angleDeg,
      cycle_period_days: cyclePeriod,
      supported_at_d: true,
    };
  }
  return dials;
}

function synthesizedBodies(jd) {
  const bodies = {};
  for (const name of Object.keys(MEAN_MOTION)) {
    const lonDeg = bodyLon(name, jd);
    const sign = lonToSign(lonDeg);
    bodies[name] = { lonDeg, ...sign };
  }
  Object.assign(bodies.moon, moonPhase(jd));
  for (const planet of ["mercury","venus","mars","jupiter","saturn"]) {
    bodies[planet].elongationDeg = wrap360(bodies[planet].lonDeg - bodies.sun.lonDeg);
  }
  return bodies;
}

function mockCalendarBits(jd) {
  // Egyptian calendar: 12 × 30 + 5 epagomenal days = 365.
  const eDay = ((Math.floor(jd - 1448638) % 365) + 365) % 365;
  const egyptian = {
    dayOfYear: eDay,
    monthIndex: Math.min(11, Math.floor(eDay / 30)),
    dayOfMonth: eDay < 360 ? (eDay % 30) + 1 : eDay - 359,
    isEpagomenal: eDay >= 360,
  };
  return { egyptian };
}

function mockDialState(jd, fallback) {
  // If a baked ephemeris is available and JD is in range, snap to its
  // nearest sample. Otherwise synthesize on the fly.
  let dials;
  if (fallback?.samples?.length && fallback?.dial_names) {
    dials = dialsFromFallback(jd, fallback);
  }
  if (!dials) dials = synthesizeDials(jd);
  return {
    ok: true,
    jd_tdb: jd,
    jd,
    dials,
    bodies: synthesizedBodies(jd),
    ...mockCalendarBits(jd),
    _mock: true,
  };
}

function dialsFromFallback(jd, fb) {
  const samples = fb.samples;
  if (!samples?.length) return null;
  // samples are sorted by JD, evenly spaced; binary-search nearest index.
  const first = samples[0].jd;
  const last  = samples[samples.length - 1].jd;
  if (jd < first || jd > last) return null;
  const step = fb.jd_step || ((last - first) / (samples.length - 1));
  const idx  = Math.max(0, Math.min(samples.length - 1, Math.round((jd - first) / step)));
  const s    = samples[idx];
  const dials = {};
  fb.dial_names.forEach((name, i) => {
    const meta = fb.dials?.[name] || {};
    dials[name] = {
      residue: s.r[i],
      modulus: meta.modulus,
      angle_deg: s.a[i],
      cycle_period_days: meta.cycle_period_days,
      supported_at_d: true,
    };
  });
  return dials;
}

/* ---- mockCalendars --------------------------------------------------- *
 * Shapes match antikythera_spectral.bridge.jd_to_* return values so live
 * mode and mock mode are interchangeable downstream.
 * ------------------------------------------------------------------------- */

function mockCalendars(jd) {
  return {
    ok: true,
    jd,
    gregorian: mockGregorian(jd),
    julian:    mockJulian(jd),
    athenian:  mockAthenian(jd),
    olympiad:  mockOlympiad(jd),
    _mock: true,
  };
}

function eraFromYear(year) { return year > 0 ? "CE" : "BCE"; }
function prolepticFromCal(year, era) {
  return era === "BCE" ? -(Math.abs(year) - 1) : year;
}

function mockGregorian(jd) {
  const z = Math.floor(jd + 0.5);
  const f = jd + 0.5 - z;
  let a = z;
  if (z >= 2299161) {
    const alpha = Math.floor((z - 1867216.25) / 36524.25);
    a = z + 1 + alpha - Math.floor(alpha / 4);
  }
  const b = a + 1524;
  const c = Math.floor((b - 122.1) / 365.25);
  const d = Math.floor(365.25 * c);
  const e = Math.floor((b - d) / 30.6001);
  const dayFrac = b - d - Math.floor(30.6001 * e) + f;
  const month = e < 14 ? e - 1 : e - 13;
  const yearFull = month > 2 ? c - 4716 : c - 4715;
  const day = Math.floor(dayFrac);
  const dayHours = (dayFrac - day) * 24;
  const hour   = Math.floor(dayHours);
  const minute = Math.floor((dayHours - hour) * 60);
  const second = Math.floor((((dayHours - hour) * 60) - minute) * 60);
  const era = eraFromYear(yearFull);
  const yearDisplay = era === "BCE" ? Math.abs(yearFull) + 1 : yearFull;  // BCE convention
  return {
    ok: true,
    year: yearDisplay,
    month, day, hour, minute, second,
    era,
    proleptic_year: yearFull,
  };
}

function mockJulian(jd) {
  // Skip Gregorian correction — proleptic Julian.
  const z = Math.floor(jd + 0.5);
  const f = jd + 0.5 - z;
  const a = z;
  const b = a + 1524;
  const c = Math.floor((b - 122.1) / 365.25);
  const d = Math.floor(365.25 * c);
  const e = Math.floor((b - d) / 30.6001);
  const dayFrac = b - d - Math.floor(30.6001 * e) + f;
  const month = e < 14 ? e - 1 : e - 13;
  const yearFull = month > 2 ? c - 4716 : c - 4715;
  const day = Math.floor(dayFrac);
  const dayHours = (dayFrac - day) * 24;
  const hour = Math.floor(dayHours);
  const minute = Math.floor((dayHours - hour) * 60);
  const second = Math.floor((((dayHours - hour) * 60) - minute) * 60);
  const era = eraFromYear(yearFull);
  const yearDisplay = era === "BCE" ? Math.abs(yearFull) + 1 : yearFull;
  return {
    ok: true,
    year: yearDisplay,
    month, day, hour, minute, second,
    era,
    proleptic_year: yearFull,
  };
}

const ATTIC_MONTHS = [
  "Hekatombaion","Metageitnion","Boedromion","Pyanepsion","Maimakterion",
  "Poseideon","Gamelion","Anthesterion","Elaphebolion","Mounichion",
  "Thargelion","Skirophorion",
];

function mockAthenian(jd) {
  // Uniform-synodic-month approximation, anchored on a plausible 1st-Hekatombaion.
  const synMonth = 29.530589;
  const epoch = 1426635;  // approx 1st Hekatombaion of Lunar Year 1 (~707 BCE)
  const monthsSince = (jd - epoch) / synMonth;
  const lunarYear = Math.floor(monthsSince / 12) + 1;
  const monthIdx = Math.floor(((monthsSince % 12) + 12) % 12);
  const dayInMonth = Math.floor(((monthsSince - Math.floor(monthsSince)) * synMonth) % 30) + 1;
  return {
    ok: true,
    attic_month: ATTIC_MONTHS[monthIdx],
    month_index: monthIdx,
    day_in_month: dayInMonth,
    lunar_year: lunarYear,
    archon: null,
    archon_table: "attic",
    approximation_note: "Mock uniform-synodic approximation.",
  };
}

function mockOlympiad(jd) {
  // 1st Olympiad: 776 BCE; anchor JD as in the package.
  const anchor = 1438178.0;
  const yearsSince = (jd - anchor) / 365.25;
  const olympiad = Math.floor(yearsSince / 4) + 1;
  const yearInOlympiad = Math.floor(((yearsSince % 4) + 4) % 4) + 1;
  return {
    ok: true,
    olympiad_number: olympiad,
    year_in_olympiad: yearInOlympiad,
    year_in_era: Math.floor(yearsSince) + 1,
    anchor_jd: anchor,
    anchor_label: "Olympiad I.1 = 776-07-01 BCE (proleptic Julian)",
  };
}

/* ---- mockEclipses ---------------------------------------------------- */

function mockEclipses(jdStart, jdEnd) {
  const out = [];
  const synMonth = 29.530589;
  const node = 0.99863; // crude
  for (let jd = jdStart; jd <= jdEnd; jd += 0.1) {
    const sunL  = bodyLon("sun",  jd);
    const moonL = bodyLon("moon", jd);
    const elong = wrap360(moonL - sunL);
    const isNew  = elong < 1 || elong > 359;
    const isFull = Math.abs(elong - 180) < 1;
    if (isNew || isFull) {
      // crude node check: only add ~once per Saros window
      if (out.length === 0 || jd - out[out.length-1].jd > synMonth - 1) {
        out.push({
          jd: Math.round(jd * 100) / 100,
          type: isNew ? "solar" : "lunar",
          magnitude: 0.5 + 0.4 * Math.random(),
        });
      }
      if (out.length > 60) break;
    }
  }
  return { ok: true, count: out.length, eclipses: out, _mock: true };
}

/* ---- mockVisibilityWindow ------------------------------------------- */

function mockVisibilityWindow(body, jd) {
  if (body === "sun" || body === "moon") {
    return { ok: true, body, jd, alwaysVisible: true, _mock: true };
  }
  const sunL  = bodyLon("sun", jd);
  const planetL = bodyLon(body, jd);
  const elongation = Math.min(wrap360(planetL - sunL), wrap360(sunL - planetL));
  const isVisible = elongation > 12;
  return {
    ok: true,
    body,
    jd,
    elongationDeg: elongation,
    isVisible,
    nextRisingJD:  jd + (isVisible ? 30 : 7),
    nextSettingJD: jd + (isVisible ?  7 : 30),
    _mock: true,
  };
}

/* ---- mockReconCompare ----------------------------------------------- */

function mockReconCompare(jd) {
  const truth = mockDialState(jd, null);
  const jitter = (deg, scale) => wrap360(deg + (Math.random() - 0.5) * scale);
  const apply = (scale) => {
    const out = {};
    for (const [k, v] of Object.entries(truth.bodies)) {
      out[k] = { lonDeg: jitter(v.lonDeg, scale) };
    }
    return out;
  };
  return {
    ok: true,
    jd,
    freeth2021: { bodies: truth.bodies, b1Teeth: 223, sharedPrimes: [7, 17, 19] },
    wright:     { bodies: apply(0.5),   b1Teeth: 223, sharedPrimes: [7, 17] },
    price1974:  { bodies: apply(2.0),   b1Teeth: 224, sharedPrimes: [7] },
    _mock: true,
  };
}

/* ---- mockEphemDiff -------------------------------------------------- */

function mockEphemDiff(jd, body) {
  // Plausible noise: arcsec scale grows as we move from J2000.
  const t = Math.abs(jd - J2000) / 365.25;
  const base = 0.05 * t;
  return {
    ok: true,
    jd,
    body: body || "sun",
    de421:       { lonArcsec: base * (1 + Math.sin(jd * 0.001)) },
    de441:       { lonArcsec: 0 },          // reference
    de441_part1: { lonArcsec: base * 0.3 * Math.cos(jd * 0.0007) },
    deltaArcsec: base,
    deltaKm:     base * 1.5e3,
    deltaAU:     base * 1e-8,
    _mock: true,
  };
}

/* ---- mockHypothesisBattery ------------------------------------------ *
 * 31-row battery from antikythera_spectral.run_hypothesis_battery().
 * Categories: A=algorithmic, B=algebraic, C=computational, D=decoding,
 * E=encoder, F=fail-modes, G=gear-architecture, H=historical-comparison.
 * Counts: 16 PASS · 9 UNDETERMINED · 3 FAIL · 3 PARTIAL.
 * ------------------------------------------------------------------------- */

const HYPOTHESIS_ROWS = [
  { id: "A-H1a", category: "A", status: "FAIL",         statement: "STRICT CF-rank: every gear ratio is in top-3 CF convergents",
    notes: "STRICT CF-rank claim: 2/13 (15%) within top-3 convergents. FAIL by design — the strict prediction is falsified. Greeks did not optimise against pure CF rank." },
  { id: "A-H1b", category: "A", status: "PASS",         statement: "LOOSE budget-respecting: mechanism (p, q) is best-rational under 500-tooth budget",
    notes: "LOOSE budget-respecting claim: 7/13 (54%) of mechanism (p, q) coincide with best-rational-under-budget-500. Greeks optimised for bronze-cutting feasibility." },
  { id: "A-H2",  category: "A", status: "PARTIAL",      statement: "Freeth 2021's {7, 17} planetary shared-prime choice is Pareto-optimal",
    notes: "Rigorous (precision, cost) Pareto: {7, 17} on primary frontier=False; on factor-reuse=True; on legacy proxy=True (2/3 ablations)." },
  { id: "A-H3",  category: "A", status: "PARTIAL",      statement: "Prime spectrum of the mechanism is non-random",
    notes: "Pearson chi-squared vs uniform spectrum suggests non-random preference for small primes 2, 3, 5, 7." },
  { id: "A-H4",  category: "A", status: "PASS",         statement: "Rare large primes (47, 127, 223, 251) are forced by astronomy",
    notes: "Each large prime is the unique smallest convergent denominator achieving observational precision." },
  { id: "B-H1",  category: "B", status: "PASS",         statement: "Every cycle is an element of C[Z/D_AntZ] for some D_Ant",
    notes: "Algebraic structure: cycles realised as integer indices in a single ring." },
  { id: "B-H2",  category: "B", status: "PASS",         statement: "Crank-turn = single generator σ_day of Z/DZ (a unit)",
    notes: "The day-tick is a generator; coprime to D_Ant." },
  { id: "B-H3",  category: "B", status: "PASS",         statement: "HDC binding via coprime roll = gear composition (chess sec9f analogue)",
    notes: "Hyperdimensional binding matches gear-train composition algebraically." },
  { id: "C-H1",  category: "C", status: "PASS",         statement: "Mechanism has zero intrinsic error correction",
    notes: "Open-loop computer; any drift accumulates without self-correction." },
  { id: "C-H2",  category: "C", status: "PASS",         statement: "Aliasing horizon = spiral-dial return-to-start (chess sec11.3.3 torus-fold)",
    notes: "Spiral wraps when modular residue completes one full cycle." },
  { id: "D-H1",  category: "D", status: "PASS",         statement: "Pin-and-slot is the antisymmetric fiber (chess sec9m pawn analogue)",
    notes: "Pin-and-slot mechanism encodes lunar variable-speed antisymmetrically." },
  { id: "D-H2",  category: "D", status: "PASS",         statement: "All non-pin-and-slot gear trains are T-symmetric",
    notes: "Time-reversal symmetry holds outside the lunar anomaly mechanism." },
  { id: "D-H3",  category: "D", status: "PASS",         statement: "σ_day fails as a unit operator on the equant-encoded channel",
    notes: "Equant-encoding breaks unit-generator structure." },
  { id: "E-H1a", category: "E", status: "UNDETERMINED", statement: "Encoder reproduces modern Saros syzygies (1999, 2017)",
    notes: "Pending live-mode kernel verification against modern eclipse catalogue." },
  { id: "E-H1b", category: "E", status: "UNDETERMINED", statement: "Encoder reproduces Almagest Hellenistic eclipses (-382 .. +125)",
    notes: "Pending live-mode kernel verification against Almagest record." },
  { id: "E-H1c", category: "E", status: "UNDETERMINED", statement: "Sky-driven Saros prediction",
    notes: "Hold while computing observability windows." },
  { id: "E-H2",  category: "E", status: "UNDETERMINED", statement: "Uniform encoder Mars peak error ≥ 150°",
    notes: "Pending live-mode mars-train integration." },
  { id: "E-H3",  category: "E", status: "UNDETERMINED", statement: "Hipparchus epicycle-only Mars model peak error in 30-60° band",
    notes: "Pending greek-model integration." },
  { id: "E-H4",  category: "E", status: "UNDETERMINED", statement: "Ptolemy equant Mars model peak error in 30-50° band (Greek limit)",
    notes: "Equant model integration deferred to live mode." },
  { id: "F-E1",  category: "F", status: "UNDETERMINED", statement: "Mechanism prime spectrum matches modern VSA/HDC encoding?",
    notes: "Open question; subject to ongoing validation." },
  { id: "F-E2",  category: "F", status: "PASS",         statement: "Natural D_Ant where every cycle becomes a single integer",
    notes: "D_Ant := lcm of all cycle denominators is well-defined." },
  { id: "F-E3",  category: "F", status: "UNDETERMINED", statement: "Which cycles are 'failed' (mechanism approximates but errs)",
    notes: "Specific failure modes not yet characterised." },
  { id: "G-H1a", category: "G", status: "FAIL",         statement: "Saros drift p95 ≤ 2° over 19 yr (CONTINUOUS regime, 24/7)",
    notes: "Continuous operation: ~13°/19yr drift accumulates. FAIL." },
  { id: "G-H1b", category: "G", status: "PASS",         statement: "Saros drift p95 ≤ 2° over 19 yr (INTERMITTENT regime)",
    notes: "Crank-as-clutch / intermittent operation: drift bounded. PASS." },
  { id: "G-H2",  category: "G", status: "PASS",         statement: "Lunar pin-and-slot tolerance not worse than straight baseline",
    notes: "Tolerance budget shows pin-and-slot meets baseline accuracy." },
  { id: "G-H3",  category: "G", status: "FAIL",         statement: "Rare-prime-bearing trains not disproportionately fragile",
    notes: "Trains with rare large primes show higher tolerance sensitivity. FAIL." },
  { id: "G-H6",  category: "G", status: "PASS",         statement: "Each subsystem admits a non-AVOID lock-attachment point (selective-lock)",
    notes: "Selective-lock topology is geometrically feasible per subsystem." },
  { id: "G-H7",  category: "G", status: "UNDETERMINED", statement: "Carrier insertion geometry",
    notes: "Carrier-gear geometry awaits radiograph cross-check." },
  { id: "G-H8",  category: "G", status: "PASS",         statement: "Paired-chain differentials viable for ≥3/5 planets (setting-mode hypothesis)",
    notes: "Mercury, Venus, Saturn admit paired-chain differentials within bronze budget." },
  { id: "H-H1",  category: "H", status: "PASS",         statement: "Antikythera prime spectrum matches Almagest period spectrum (χ² p > 0.05)",
    notes: "Spectra statistically consistent with shared cultural-mathematical lineage." },
  { id: "H-H2",  category: "H", status: "PARTIAL",      statement: "Antikythera and MUL.APIN top-7 prime Jaccard ≥ 0.5",
    notes: "Top-7 prime overlap shows partial Babylonian inheritance." },
];

function mockHypothesisBattery(opts, fallback) {
  // Prefer the cached battery from the baked NDJSON if available — it's the
  // real package output captured at bake time. Else fall through to the
  // hand-curated rows (close, but not authoritative).
  if (fallback?.hypothesis_battery?.rows) {
    const cached = fallback.hypothesis_battery;
    return { ...cached, _mock: true };
  }
  const regime = (opts && opts.regime) || "intermittent";
  const kernel = (opts && opts.kernel) || "DE441";
  return {
    ok: true,
    n_rows: HYPOTHESIS_ROWS.length,
    rows: HYPOTHESIS_ROWS.map(r => ({ ...r })),
    details_keys: ["statement", "computed_value", "threshold", "status", "notes"],
    regime, kernel,
    _mock: true,
  };
}

/* ---- mockArchitectureMode ------------------------------------------ */

function mockArchitectureMode(name, on, jd, fallback) {
  return {
    ok: true,
    mode: name,
    enabled: on,
    summary: `${name} ${on ? "engaged" : "disengaged"} (mock)`,
    affectedGears: { clutch: ["a1"], setting: ["c2","d2","e1"], missing: ["i1","k2","m1"] }[name] || [],
    confidence: { clutch: "MODERATE", setting: "HIGH", missing: "LOW", reverse: "MODERATE" }[name] || "LOW",
    _mock: true,
  };
}

/* ---- mockGearDag ---------------------------------------------------- */

function mockGearDag() {
  // Layered DAG, ~30 surviving + ~39 conjectural. Edge weights = mesh ratio.
  const nodes = [
    // input
    { id: "a1", layer: 0, teeth: 48, surviving: true, label: "crank" },
    // trunk
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
    // leaves
    { id: "i1", layer: 5, teeth: 60,  surviving: true,  label: "Mercury leaf" },
    { id: "k2", layer: 5, teeth: 64,  surviving: true,  label: "Venus leaf"   },
    { id: "m1", layer: 5, teeth: 50,  surviving: true,  label: "Jupiter leaf" },
    // conjectural (sample)
    { id: "j1", layer: 5, teeth: 49,  surviving: false },
    { id: "j2", layer: 5, teeth: 71,  surviving: false },
    { id: "n1", layer: 5, teeth: 24,  surviving: false },
    { id: "n2", layer: 5, teeth: 115, surviving: false },
    { id: "p1", layer: 5, teeth: 7,   surviving: false },
    { id: "p2", layer: 5, teeth: 17,  surviving: false },
  ];
  const edges = [
    ["a1","b1"], ["b1","b2"], ["b2","c1"], ["c1","c2"], ["c2","d1"],
    ["d1","d2"], ["d2","e1"], ["e1","e2"], ["e2","e3"], ["e3","e4"],
    ["e4","e5"], ["e5","e6"], ["e6","f1"], ["f1","f2"], ["f2","g1"],
    ["g1","g2"], ["g2","h1"], ["h1","h2"], ["h2","i1"], ["i1","k2"],
    ["k2","m1"], ["m1","j1"], ["j1","j2"], ["j2","n1"], ["n1","n2"],
    ["n2","p1"], ["p1","p2"],
  ].map(([from, to]) => ({ from, to }));
  return { ok: true, nodes, edges, _mock: true };
}

/* ---- mockPairedChains ----------------------------------------------- */

const PAIRED_CHAINS = {
  venus: {
    canonical: { ratio: "5/8",       teeth: [5, 8],            sharedPrimes: [] },
    freeth:    { ratio: "289/462",   teeth: [17, 17, 14, 33],  sharedPrimes: [17] },
    differential: { description: "Venus paired-chain differential (5/8 + 289/462 calibration)" },
  },
  mercury: {
    canonical: { ratio: "104/33",    teeth: [104, 33],         sharedPrimes: [] },
    freeth:    { ratio: "729/233",   teeth: [27, 27, 233],     sharedPrimes: [] },
    differential: { description: "Mercury 7-yr return chain" },
  },
  mars: {
    canonical: { ratio: "37/79",     teeth: [37, 79],          sharedPrimes: [] },
    freeth:    { ratio: "133/142",   teeth: [7, 19, 142],      sharedPrimes: [7, 19] },
    differential: { description: "Mars retrograde calibration; epicycle peak ~51° (epicycle-only)" },
  },
  jupiter: {
    canonical: { ratio: "76/83",     teeth: [76, 83],          sharedPrimes: [] },
    freeth:    { ratio: "144/121",   teeth: [12, 12, 121],     sharedPrimes: [] },
    differential: { description: "Jupiter 12-yr return chain" },
  },
  saturn: {
    canonical: { ratio: "59/115",    teeth: [59, 115],         sharedPrimes: [] },
    freeth:    { ratio: "57/119",    teeth: [3, 19, 7, 17],    sharedPrimes: [7, 17, 19] },
    differential: { description: "Saturn 30-yr return chain — heaviest shared-prime reuse" },
  },
};

function mockPairedChains(planet) {
  const data = PAIRED_CHAINS[planet];
  if (!data) return { ok: false, error: `unknown planet ${planet}` };
  return { ok: true, planet, ...data, _mock: true };
}

/* ---- mockSeasonalWindows -------------------------------------------- */

function mockSeasonalWindows(year) {
  // Per-planet visibility strips through the year. Synthesized but plausible.
  const windows = {};
  for (const planet of ["mercury","venus","mars","jupiter","saturn"]) {
    const apparitions = [];
    const period = { mercury: 116, venus: 584, mars: 780, jupiter: 399, saturn: 378 }[planet];
    const visibleFrac = { mercury: 0.20, venus: 0.66, mars: 0.85, jupiter: 0.91, saturn: 0.92 }[planet];
    let day = 0;
    while (day < 365) {
      const visDays = Math.round(period * visibleFrac);
      const invDays = period - visDays;
      apparitions.push({ startDay: day, endDay: Math.min(365, day + visDays), state: "visible" });
      apparitions.push({ startDay: Math.min(365, day + visDays), endDay: Math.min(365, day + visDays + invDays), state: "invisible" });
      day += period;
    }
    windows[planet] = apparitions.filter(a => a.endDay > a.startDay);
  }
  return { ok: true, year, windows, _mock: true };
}

/* ---- mockParetoFrontier --------------------------------------------- */

function mockParetoFrontier(primes) {
  const usePrimes = primes && primes.length ? primes : [7, 17];
  // (precision-arcsec, cost-teeth) frontier — synthesized.
  const points = [];
  for (let i = 1; i <= 12; i++) {
    points.push({ precisionArcsec: 60 / i, costTeeth: 100 + 30 * i, primes: usePrimes });
  }
  return {
    ok: true,
    primes: usePrimes,
    points,
    freethPoint: { precisionArcsec: 8.0, costTeeth: 312, primes: [7, 17] },
    _mock: true,
  };
}

/* ---- mockGreekModel ------------------------------------------------- */

function mockGreekModel(planet, jd, mode) {
  const truth = bodyLon(planet, jd);
  const peakErr = { uniform: 180, epicycle: 51, equant: 49 }[mode] || 0;
  const t = jd - J2000;
  const phase = Math.sin(2 * Math.PI * t / 780) * peakErr * 0.3;
  return { ok: true, planet, mode, jd, lonDeg: wrap360(truth + phase), peakErrorDeg: peakErr, _mock: true };
}

/* ---- mockOperatorRecalibrate ---------------------------------------- */

function mockOperatorRecalibrate(anchor, jd) {
  const drifts = { olympic: 0.5, metonic: 1.2, saros: 0.8, callippic: 0.1 };
  return {
    ok: true,
    anchor: anchor || "olympic",
    jd,
    driftDeg: drifts[anchor] ?? 0.7,
    advancedJD: jd,
    _mock: true,
  };
}

/* ---- in-memory fallback synthesizer --------------------------------- */

function synthesizeFallback() {
  // We don't actually need pre-baked data — every mock function computes
  // fresh from JD. Returned object is just a sentinel.
  return { entries: [], synthesized: true };
}
