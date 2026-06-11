import { CLOSE_RATE_TARGET, CONVERSION_TARGETS, STAGE_LABELS, TRAILING_WINDOW_DAYS } from "./config";
import { lastNPeriods, periodEnd, periodLabel } from "./periods";
import type { Deal, StageKey } from "./types";

/**
 * Conversion-trend math: the rolling-90-day rates recomputed AS OF each
 * monthly marker, point-in-time — a deal that converts in May must not
 * retro-color February's reading, so conversions count only if they happened
 * by the marker. Consequence: recent markers sit low while their cohorts are
 * still in flight (same caveat as the Funnel Leaks snapshot).
 */

const MS_DAY = 86_400_000;
const LOW_SAMPLE = 5; // fewer attempts than this in a window = dim + flag

export interface RatePoint {
  /** null when the window has no attempts. */
  rate: number | null;
  num: number;
  den: number;
  lowSample: boolean;
}

/** Rolling-window conversion as of `asOf` (cohort entered `from` in (asOf−90d, asOf]). */
export function conversionAt(deals: Deal[], from: StageKey, to: StageKey, asOf: number): RatePoint {
  const since = asOf - TRAILING_WINDOW_DAYS * MS_DAY;
  const cohort = deals.filter((d) => {
    const ts = d.entered[from];
    return ts !== undefined && ts > since && ts <= asOf;
  });
  const num = cohort.filter((d) => d.entered[to] !== undefined && (d.entered[to] as number) <= asOf).length;
  const den = cohort.length;
  return { rate: den ? num / den : null, num, den, lowSample: den > 0 && den < LOW_SAMPLE };
}

/** Rolling-window close rate as of `asOf` — won ÷ (won + lost) closing in the window. */
export function closeRateAt(deals: Deal[], asOf: number): RatePoint {
  const since = asOf - TRAILING_WINDOW_DAYS * MS_DAY;
  const closedIn = (k: StageKey) =>
    deals.filter((d) => {
      const ts = d.entered[k];
      return ts !== undefined && ts > since && ts <= asOf;
    }).length;
  const won = closedIn("won");
  const lost = closedIn("lost");
  const den = won + lost;
  return { rate: den ? won / den : null, num: won, den, lowSample: den > 0 && den < LOW_SAMPLE };
}

export interface TrendSeries {
  /** Recharts data key, e.g. "sal_sql" or "close". */
  key: string;
  label: string;
  target: number;
}

export interface TrendChart {
  series: TrendSeries[];
  /** Flat Recharts rows: label, key, per-series `<key>` (rate %, all points),
   *  `<key>Hi` (rate % with low-sample points nulled), `<key>Meta` (RatePoint). */
  rows: Record<string, unknown>[];
}

export function conversionTrendRows(deals: Deal[], now: number, pilotTracked: boolean): TrendChart {
  const steps = CONVERSION_TARGETS.filter(
    (s) => pilotTracked || (s.from !== "pilot" && s.to !== "pilot")
  );
  const series: TrendSeries[] = [
    ...steps.map((s) => ({
      key: `${s.from}_${s.to}`,
      label: `${STAGE_LABELS[s.from]}→${STAGE_LABELS[s.to]}`,
      target: s.rate,
    })),
    { key: "close", label: "Close Rate", target: CLOSE_RATE_TARGET },
  ];

  const rows = lastNPeriods("month", 12, now).map((key) => {
    const asOf = Math.min(periodEnd(key).getTime() - 1, now);
    const row: Record<string, unknown> = { key, label: periodLabel(key, { short: true }), asOf };
    for (const s of steps) {
      const p = conversionAt(deals, s.from, s.to, asOf);
      const k = `${s.from}_${s.to}`;
      row[k] = p.rate === null ? null : p.rate * 100;
      row[`${k}Hi`] = p.rate === null || p.lowSample ? null : p.rate * 100;
      row[`${k}Meta`] = p;
    }
    const c = closeRateAt(deals, asOf);
    row.close = c.rate === null ? null : c.rate * 100;
    row.closeHi = c.rate === null || c.lowSample ? null : c.rate * 100;
    row.closeMeta = c;
    return row;
  });

  return { series, rows };
}
