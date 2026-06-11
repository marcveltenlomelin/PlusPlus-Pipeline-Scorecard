import { ARR_TARGET, AT_RISK_THRESHOLD, NET_NEW_OPP_STAGE, TRAILING_WINDOW_DAYS } from "./config";
import {
  elapsedFraction,
  granularityOf,
  inPeriod,
  isCurrentPeriod,
  periodKey,
  periodLabel,
  periodStart,
} from "./periods";
import type { Deal, Granularity, StageKey } from "./types";

/**
 * Pure functions over normalized deals. Everything here counts STAGE ENTRIES
 * in a period (throughput), never current board occupancy — that distinction
 * is the whole point of the dashboard.
 */

const MS_DAY = 86_400_000;

export interface StageCount {
  count: number;
  totalValue: number;
  deals: Deal[];
}

/** Deals that entered `stage` within the period, with their summed value. */
export function enteredInPeriod(deals: Deal[], stage: StageKey, key: string): StageCount {
  const hits = deals.filter((d) => {
    const ts = d.entered[stage];
    return ts !== undefined && inPeriod(ts, key);
  });
  return { count: hits.length, totalValue: hits.reduce((s, d) => s + d.value, 0), deals: hits };
}

/** Deals currently sitting in a stage (occupancy — used only for Pilot fallback). */
export function occupancy(deals: Deal[], stageId: string): StageCount {
  const hits = deals.filter((d) => d.stageId === stageId);
  return { count: hits.length, totalValue: hits.reduce((s, d) => s + d.value, 0), deals: hits };
}

/**
 * Cohort conversion over a trailing window: of deals that entered `from`
 * in the last TRAILING_WINDOW_DAYS, the share that has (ever) entered `to`.
 */
export function conversion(
  deals: Deal[],
  from: StageKey,
  to: StageKey,
  now: number
): { rate: number | null; cohort: number; converted: number } {
  const since = now - TRAILING_WINDOW_DAYS * MS_DAY;
  const cohort = deals.filter((d) => {
    const ts = d.entered[from];
    return ts !== undefined && ts >= since && ts <= now;
  });
  const converted = cohort.filter((d) => d.entered[to] !== undefined);
  return {
    rate: cohort.length ? converted.length / cohort.length : null,
    cohort: cohort.length,
    converted: converted.length,
  };
}

/** Won / (Won + Lost) among deals that closed in the trailing window. */
export function closeRate(
  deals: Deal[],
  now: number
): { rate: number | null; won: number; lost: number } {
  const since = now - TRAILING_WINDOW_DAYS * MS_DAY;
  const closedIn = (k: StageKey) =>
    deals.filter((d) => {
      const ts = d.entered[k];
      return ts !== undefined && ts >= since && ts <= now;
    }).length;
  const won = closedIn("won");
  const lost = closedIn("lost");
  return { rate: won + lost ? won / (won + lost) : null, won, lost };
}

export interface Pace {
  actual: number;
  goal: number;
  expected: number;
  projected: number;
  elapsed: number;
  status: "ahead" | "on-track" | "behind" | "done";
}

/**
 * Straight-line pace: expected = goal × elapsed, projected = actual ÷ elapsed.
 * For past periods, projected = actual (the period is over).
 */
export function pace(actual: number, goal: number, key: string, now: number): Pace {
  const elapsed = elapsedFraction(key, now);
  const expected = goal * elapsed;
  const projected = elapsed >= 1 ? actual : elapsed > 0 ? actual / elapsed : 0;
  let status: Pace["status"];
  if (elapsed >= 1) status = actual >= goal ? "done" : "behind";
  else if (actual >= goal) status = "done";
  else if (projected >= goal) status = projected >= goal * 1.15 ? "ahead" : "on-track";
  else status = "behind";
  return { actual, goal, expected, projected, elapsed, status };
}

export type PacingState = "ahead" | "on-pace" | "slightly-behind" | "at-risk";

export interface PacingBadge {
  state: PacingState;
  ratio: number;
  expected: number;
}

/**
 * Badge state for a Stage Entry card: actual vs where the goal says the
 * stage should be by now (expected = goal × elapsed fraction — the same
 * straight-line math as pace()). Bands: ≥1.15 ahead · ≥0.9 on pace ·
 * ≥0.6 slightly behind · else at risk. Weeks keep the old simple rule:
 * flag only when behind the 75% line, and amber (never red) before
 * mid-week — a few quiet days early in a short period aren't a signal.
 */
export function pacingBadge(
  actual: number,
  goal: number | undefined,
  key: string,
  now: number
): PacingBadge | null {
  if (!goal) return null;
  const elapsed = isCurrentPeriod(key, now) ? elapsedFraction(key, now) : 1;
  const expected = goal * elapsed;
  if (expected <= 0) return null;
  const ratio = actual / expected;
  if (granularityOf(key) === "week") {
    if (actual >= AT_RISK_THRESHOLD * expected) return null;
    return { state: elapsed < 0.5 ? "slightly-behind" : "at-risk", ratio, expected };
  }
  const state: PacingState =
    ratio >= 1.15 ? "ahead" : ratio >= 0.9 ? "on-pace" : ratio >= 0.6 ? "slightly-behind" : "at-risk";
  return { state, ratio, expected };
}

/** Open deals that have entered a given stage — the live pipeline basis. */
export function openPipeline(deals: Deal[], enteredStage: StageKey): StageCount {
  const hits = deals.filter((d) => d.isOpen && d.entered[enteredStage] !== undefined);
  return { count: hits.length, totalValue: hits.reduce((s, d) => s + d.value, 0), deals: hits };
}

export interface PipelineCoverage {
  /** open ÷ remaining; null when the quota is already met (remaining ≤ 0). */
  ratio: number | null;
  open: number;
  remaining: number;
  /** "2026" (remaining-year math) or "Q2 2026" (quarter view). */
  scopeLabel: string;
}

/**
 * Open pipeline ÷ remaining quota — the standard SaaS coverage check.
 * Quarter view measures against the quarter's slice of the annual target;
 * every other view measures against the remaining year.
 */
export function pipelineCoverage(deals: Deal[], granularity: Granularity, now: number): PipelineCoverage {
  const open = openPipeline(deals, NET_NEW_OPP_STAGE).totalValue;
  let quota: number;
  let wonStart: number;
  let scopeLabel: string;
  if (granularity === "quarter") {
    const qKey = periodKey(now, "quarter");
    quota = ARR_TARGET / 4;
    wonStart = periodStart(qKey).getTime();
    scopeLabel = periodLabel(qKey);
  } else {
    quota = ARR_TARGET;
    wonStart = new Date(new Date(now).getFullYear(), 0, 1).getTime();
    scopeLabel = String(new Date(now).getFullYear());
  }
  const won = valueEnteredBetween(deals, "won", wonStart, now).totalValue;
  const remaining = Math.max(0, quota - won);
  return { ratio: remaining > 0 ? open / remaining : null, open, remaining, scopeLabel };
}

/** Sum of value entering `stage` between two epoch-ms instants (start inclusive). */
export function valueEnteredBetween(
  deals: Deal[],
  stage: StageKey,
  start: number,
  end: number
): StageCount {
  const hits = deals.filter((d) => {
    const ts = d.entered[stage];
    return ts !== undefined && ts >= start && ts < end;
  });
  return { count: hits.length, totalValue: hits.reduce((s, d) => s + d.value, 0), deals: hits };
}
