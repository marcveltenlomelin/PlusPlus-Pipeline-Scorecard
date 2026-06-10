import { TRAILING_WINDOW_DAYS } from "./config";
import { elapsedFraction, inPeriod } from "./periods";
import type { Deal, StageKey } from "./types";

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

/** Open deals that have entered a given stage — the live pipeline basis. */
export function openPipeline(deals: Deal[], enteredStage: StageKey): StageCount {
  const hits = deals.filter((d) => d.isOpen && d.entered[enteredStage] !== undefined);
  return { count: hits.length, totalValue: hits.reduce((s, d) => s + d.value, 0), deals: hits };
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
