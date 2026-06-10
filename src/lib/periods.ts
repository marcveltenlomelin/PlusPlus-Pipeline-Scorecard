import type { Granularity } from "./types";

/**
 * Period keys are stable strings: "2026-06" (month), "2026-W24" (ISO week,
 * Monday start), "2026-Q2" (calendar quarter), "2026" (year). All bucketing
 * happens in the viewer's local timezone — one consistent clock for every
 * number on screen.
 */

const MS_DAY = 86_400_000;

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

/** ISO-8601 week number + ISO week-year for a local date. */
function isoWeek(d: Date): { year: number; week: number } {
  // Thursday of this week decides the ISO year.
  const t = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const day = (t.getDay() + 6) % 7; // Mon=0..Sun=6
  t.setDate(t.getDate() - day + 3);
  const isoYear = t.getFullYear();
  const jan4 = new Date(isoYear, 0, 4);
  const jan4Day = (jan4.getDay() + 6) % 7;
  const week1Mon = new Date(isoYear, 0, 4 - jan4Day);
  const week = 1 + Math.round((t.getTime() - week1Mon.getTime()) / (7 * MS_DAY) - 3 / 7);
  return { year: isoYear, week };
}

export function periodKey(ts: number, g: Granularity): string {
  const d = new Date(ts);
  if (g === "year") return String(d.getFullYear());
  if (g === "month") return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
  if (g === "quarter") return `${d.getFullYear()}-Q${Math.floor(d.getMonth() / 3) + 1}`;
  const { year, week } = isoWeek(d);
  return `${year}-W${pad(week)}`;
}

export function periodStart(key: string): Date {
  const w = key.match(/^(\d{4})-W(\d{2})$/);
  if (w) {
    const year = +w[1];
    const jan4 = new Date(year, 0, 4);
    const jan4Day = (jan4.getDay() + 6) % 7;
    const week1Mon = new Date(year, 0, 4 - jan4Day);
    return new Date(week1Mon.getFullYear(), week1Mon.getMonth(), week1Mon.getDate() + (+w[2] - 1) * 7);
  }
  const q = key.match(/^(\d{4})-Q(\d)$/);
  if (q) return new Date(+q[1], (+q[2] - 1) * 3, 1);
  const m = key.match(/^(\d{4})-(\d{2})$/);
  if (m) return new Date(+m[1], +m[2] - 1, 1);
  const y = key.match(/^(\d{4})$/);
  if (y) return new Date(+y[1], 0, 1);
  throw new Error(`Bad period key: ${key}`);
}

/** Exclusive end (start of the next period). */
export function periodEnd(key: string): Date {
  const s = periodStart(key);
  if (key.includes("-W")) return new Date(s.getFullYear(), s.getMonth(), s.getDate() + 7);
  if (key.includes("-Q")) return new Date(s.getFullYear(), s.getMonth() + 3, 1);
  if (/^\d{4}$/.test(key)) return new Date(s.getFullYear() + 1, 0, 1);
  return new Date(s.getFullYear(), s.getMonth() + 1, 1);
}

export function granularityOf(key: string): Granularity {
  if (/^\d{4}$/.test(key)) return "year";
  return key.includes("-W") ? "week" : key.includes("-Q") ? "quarter" : "month";
}

export function inPeriod(ts: number, key: string): boolean {
  return ts >= periodStart(key).getTime() && ts < periodEnd(key).getTime();
}

export function shiftPeriod(key: string, by: number): string {
  const s = periodStart(key);
  const g = granularityOf(key);
  const mid =
    g === "week"
      ? new Date(s.getFullYear(), s.getMonth(), s.getDate() + by * 7 + 3)
      : g === "quarter"
        ? new Date(s.getFullYear(), s.getMonth() + by * 3, 15)
        : g === "year"
          ? new Date(s.getFullYear() + by, 6, 1)
          : new Date(s.getFullYear(), s.getMonth() + by, 15);
  return periodKey(mid.getTime(), g);
}

export function lastNPeriods(g: Granularity, n: number, now: number): string[] {
  const current = periodKey(now, g);
  const keys: string[] = [];
  for (let i = n - 1; i >= 0; i--) keys.push(shiftPeriod(current, -i));
  return keys;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export function periodLabel(key: string, opts: { short?: boolean } = {}): string {
  const s = periodStart(key);
  const w = key.match(/^(\d{4})-W(\d{2})$/);
  if (w) {
    const lbl = `W${+w[2]}`;
    return opts.short ? lbl : `${lbl} · ${MONTHS[s.getMonth()]} ${s.getDate()}, ${w[1]}`;
  }
  const q = key.match(/^(\d{4})-Q(\d)$/);
  if (q) return opts.short ? `Q${q[2]} ’${q[1].slice(2)}` : `Q${q[2]} ${q[1]}`;
  if (/^\d{4}$/.test(key)) return key;
  return opts.short ? `${MONTHS[s.getMonth()]} ’${String(s.getFullYear()).slice(2)}` : `${MONTHS[s.getMonth()]} ${s.getFullYear()}`;
}

/** Human phrase for headline labels: "this month", "W24", "Q2 2026"… */
export function periodPhrase(key: string, now: number): string {
  const g = granularityOf(key);
  if (key === periodKey(now, g)) {
    return g === "week" ? "this week" : g === "month" ? "this month" : g === "quarter" ? "this quarter" : "this year";
  }
  return periodLabel(key);
}

/** Fraction of the period elapsed as of `now`, clamped to [0, 1]. */
export function elapsedFraction(key: string, now: number): number {
  const s = periodStart(key).getTime();
  const e = periodEnd(key).getTime();
  return Math.min(1, Math.max(0, (now - s) / (e - s)));
}

export function isCurrentPeriod(key: string, now: number): boolean {
  return key === periodKey(now, granularityOf(key));
}
