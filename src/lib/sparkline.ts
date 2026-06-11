import { enteredInPeriod } from "./metrics";
import { inPeriod, lastNPeriods, periodLabel } from "./periods";
import type { Deal, StageKey } from "./types";

/**
 * Stage-card sparkline data: 13 monthly entry counts (current month at the
 * right, the same month last year at the left) plus the YoY comparison.
 * Portals younger than 13 months get a clipped window and a "Since …" label
 * instead of a YoY percent.
 */

const WINDOW_MONTHS = 13;

export interface SparklinePoint {
  key: string;
  /** Short label, e.g. "Jun ’25". */
  label: string;
  count: number;
}

export interface StageSparkline {
  /** Oldest first; 13 points, or fewer when clipped to the stage's history. */
  points: SparklinePoint[];
  /** Same-month-last-year comparison; null when the window is clipped. */
  yoy: { label: string; prior: number; pct: number | null } | null;
  /** "Aug ’25" when clipped — the first month with any entry for this stage. */
  since: string | null;
}

export function stageSparkline(deals: Deal[], stage: StageKey, now: number): StageSparkline {
  const keys = lastNPeriods("month", WINDOW_MONTHS, now);
  const all = keys.map((key) => ({
    key,
    label: periodLabel(key, { short: true }),
    count: enteredInPeriod(deals, stage, key).count,
  }));

  // Clip leading months that predate the stage's first-ever entry. A first
  // entry BEFORE the window means full history exists — no clipping.
  const entries = deals.map((d) => d.entered[stage]).filter((t): t is number => t !== undefined);
  const first = entries.length ? Math.min(...entries) : undefined;
  const firstIdx = first === undefined ? -1 : all.findIndex((p) => inPeriod(first, p.key));
  const points = firstIdx > 0 ? all.slice(firstIdx) : all;
  const clipped = points.length < WINDOW_MONTHS;

  if (clipped) {
    return { points, yoy: null, since: points[0]?.label ?? null };
  }

  const prior = points[0];
  const current = points[points.length - 1];
  return {
    points,
    yoy: {
      label: prior.label,
      prior: prior.count,
      pct: prior.count > 0 ? (current.count - prior.count) / prior.count : null,
    },
    since: null,
  };
}
