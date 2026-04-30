/* ------------------------------------------------------------------------- *
 * hud/calendars.js — four parallel calendar readouts in the topbar.
 *
 * Updates the spans inside #calendar-readout on every JD change. Calls
 * bridge.calendars(jd) and pulls Gregorian, Julian, Athenian, and Olympiad
 * fields into a compact mono-display string each.
 * ------------------------------------------------------------------------- */

const MONTHS = ["", "Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

export function mountCalendars(host, state, onChange, bridge) {
  if (!host) return;
  const cells = {
    gregorian: host.querySelector('[data-cal="gregorian"]'),
    julian:    host.querySelector('[data-cal="julian"]'),
    athenian:  host.querySelector('[data-cal="athenian"]'),
    olympiad:  host.querySelector('[data-cal="olympiad"]'),
  };

  let inflightJd = null;
  let lastJd = null;

  async function refresh(jd) {
    if (jd === lastJd) return;
    inflightJd = jd;
    let cals;
    try {
      cals = await bridge.calendars(jd);
    } catch (e) {
      console.error("calendars()", e);
      return;
    }
    if (inflightJd !== jd) return;  // a newer request superseded us
    lastJd = jd;

    if (cells.gregorian) cells.gregorian.textContent = formatCivil(cals.gregorian, "greg");
    if (cells.julian)    cells.julian.textContent    = formatCivil(cals.julian,    "jul");
    if (cells.athenian)  cells.athenian.textContent  = formatAthenian(cals.athenian);
    if (cells.olympiad)  cells.olympiad.textContent  = formatOlympiad(cals.olympiad);
  }

  refresh(state.jd);
  onChange((s) => refresh(s.jd));
}

function formatCivil(c, tag) {
  if (!c || c.year == null) return "—";
  const era = c.era || (c.proleptic_year > 0 ? "CE" : "BCE");
  const m = MONTHS[c.month] || "?";
  const day = String(c.day).padStart(2, "0");
  const yr  = String(c.year).padStart(c.year < 100 ? 3 : 0, " ");
  return `${tag} ${yr}-${m}-${day} ${era}`;
}

function formatAthenian(a) {
  if (!a) return "—";
  const month = a.attic_month || "—";
  const day = a.day_in_month != null ? a.day_in_month : "?";
  const year = a.lunar_year != null ? a.lunar_year : "?";
  return `att ${month} ${day} · y${year}`;
}

function formatOlympiad(o) {
  if (!o) return "—";
  const num = o.olympiad_number != null ? o.olympiad_number : "?";
  const yr  = o.year_in_olympiad != null ? o.year_in_olympiad : "?";
  return `Olymp ${num}.${yr}`;
}
