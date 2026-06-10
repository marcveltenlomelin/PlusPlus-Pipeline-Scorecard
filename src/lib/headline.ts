import type { Deal, Granularity } from "./types";

/**
 * Headline KPIs: win rate, sales-cycle length, and deal size over a long
 * window (trailing 12 months, or YTD in year view), each with a prior-window
 * comparison. Pure functions — testable, no UI.
 */

const MS_DAY = 86_400_000;

export interface KpiWindow {
  start: number;
  /** Exclusive. */
  end: number;
}

export interface HeadlineWindows {
  cur: KpiWindow;
  prior: KpiWindow;
  /** Section label suffix, e.g. "Trailing 12 Months" or "2026 YTD". */
  label: string;
}

/**
 * Current + prior comparison windows. Year view compares YTD against the
 * *same span* of the prior year (Jan 1 → same date), not the full year —
 * apples to apples. Everything else uses trailing 12 calendar months.
 */
export function headlineWindows(now: number, granularity: Granularity): HeadlineWindows {
  const d = new Date(now);
  if (granularity === "year") {
    const start = new Date(d.getFullYear(), 0, 1).getTime();
    const priorStart = new Date(d.getFullYear() - 1, 0, 1).getTime();
    const priorEnd = new Date(d.getFullYear() - 1, d.getMonth(), d.getDate(), d.getHours(), d.getMinutes()).getTime();
    return {
      cur: { start, end: now },
      prior: { start: priorStart, end: priorEnd },
      label: `${d.getFullYear()} YTD`,
    };
  }
  const start = new Date(d.getFullYear(), d.getMonth() - 12, d.getDate(), d.getHours(), d.getMinutes()).getTime();
  const priorStart = new Date(d.getFullYear(), d.getMonth() - 24, d.getDate(), d.getHours(), d.getMinutes()).getTime();
  return {
    cur: { start, end: now },
    prior: { start: priorStart, end: start },
    label: "Trailing 12 Months",
  };
}

/** Linear-interpolation quantile of an ASCENDING-sorted array. */
export function quantile(sorted: number[], q: number): number {
  if (sorted.length === 0) return NaN;
  const pos = (sorted.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  if (lo === hi) return sorted[lo];
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
}

export interface WinRateKpi {
  /** null when nothing closed in the window. */
  rate: number | null;
  won: number;
  lost: number;
  priorRate: number | null;
}

export interface CycleKpi {
  /** Median days SAL-created → closed-won; null when no wins in the window. */
  median: number | null;
  p25: number | null;
  p75: number | null;
  priorMedian: number | null;
  wins: number;
}

export interface DealSizeKpi {
  /** Mean closed-won value; null when no wins in the window. */
  mean: number | null;
  median: number | null;
  priorMean: number | null;
  wins: number;
}

export interface HeadlineKpis {
  winRate: WinRateKpi;
  cycle: CycleKpi;
  dealSize: DealSizeKpi;
}

const inWindow = (ts: number | undefined, w: KpiWindow): ts is number =>
  ts !== undefined && ts >= w.start && ts < w.end;

function winsIn(deals: Deal[], w: KpiWindow): Deal[] {
  return deals.filter((d) => inWindow(d.entered.won, w));
}

function winRateIn(deals: Deal[], w: KpiWindow): { rate: number | null; won: number; lost: number } {
  const won = winsIn(deals, w).length;
  const lost = deals.filter((d) => inWindow(d.entered.lost, w)).length;
  return { rate: won + lost ? won / (won + lost) : null, won, lost };
}

function cycleDays(deals: Deal[]): number[] {
  return deals
    .map((d) => ((d.entered.won as number) - d.createdAt) / MS_DAY)
    .filter((n) => n >= 0)
    .sort((a, b) => a - b);
}

export function headlineKpis(deals: Deal[], cur: KpiWindow, prior: KpiWindow): HeadlineKpis {
  const curWr = winRateIn(deals, cur);
  const priorWr = winRateIn(deals, prior);

  const curWins = winsIn(deals, cur);
  const priorWins = winsIn(deals, prior);

  const curCycle = cycleDays(curWins);
  const priorCycle = cycleDays(priorWins);

  const curValues = curWins.map((d) => d.value).sort((a, b) => a - b);

  return {
    winRate: { ...curWr, priorRate: priorWr.rate },
    cycle: {
      median: curCycle.length ? quantile(curCycle, 0.5) : null,
      p25: curCycle.length ? quantile(curCycle, 0.25) : null,
      p75: curCycle.length ? quantile(curCycle, 0.75) : null,
      priorMedian: priorCycle.length ? quantile(priorCycle, 0.5) : null,
      wins: curWins.length,
    },
    dealSize: {
      mean: curValues.length ? curValues.reduce((s, v) => s + v, 0) / curValues.length : null,
      median: curValues.length ? quantile(curValues, 0.5) : null,
      priorMean: priorWins.length ? priorWins.reduce((s, d) => s + d.value, 0) / priorWins.length : null,
      wins: curWins.length,
    },
  };
}
