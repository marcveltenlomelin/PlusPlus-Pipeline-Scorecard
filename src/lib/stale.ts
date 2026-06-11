import {
  ON_HOLD_ATTENTION_DAYS,
  ON_HOLD_MATCH,
  STALE_DEFAULT_THRESHOLD,
  STALE_STAGE_MATCHERS,
  STALE_THRESHOLDS,
} from "./config";
import type { Deal } from "./types";

/**
 * Staleness — the one shared definition consumed by the Open Deals STATUS
 * column, the Needs Attention section, and the Today's Focus scoring.
 *
 * "Days in current stage" fallback chain:
 *   1. HubSpot stage-change history — not fetched (would touch the data layer).
 *   2. Last-activity date — not on the Deal shape either.
 *   3. PROXY USED: days since the deal's last *tracked* stage entry
 *      (max of the hs_v2_date_entered_* timestamps we already pull, with
 *      createdate as the floor). A deal that entered SQL 60 days ago and
 *      hasn't hit a deeper tracked stage since reads as 60 days in stage.
 *      Untracked intermediate moves (e.g. into "On Hold") are invisible, so
 *      this measures "days since last observable progress" — which is the
 *      thing staleness actually cares about.
 */

const MS_DAY = 86_400_000;

export type StaleStatus = "fresh" | "aging" | "stale" | "on-hold";

export interface DealStaleness {
  status: StaleStatus;
  daysInStage: number;
  /** Stage threshold in days; null for On Hold (gated by ON_HOLD_ATTENTION_DAYS instead). */
  threshold: number | null;
  /** Belongs in the Needs Attention list: stale, or On Hold past the gate. */
  needsAttention: boolean;
}

/** Days since the last tracked stage entry (see fallback-chain note above). */
export function daysInStage(deal: Deal, now: number): number {
  const last = Math.max(...Object.values(deal.entered));
  return Math.max(0, Math.floor((now - last) / MS_DAY));
}

/**
 * Classify a free-form current-stage label to a funnel stage key. Shared by
 * stale thresholds and forecast weighting — one classification, two consumers.
 */
export function matchStageKey(stageLabel: string): keyof typeof STALE_THRESHOLDS | null {
  for (const [key, re] of STALE_STAGE_MATCHERS) {
    if (re.test(stageLabel)) return key;
  }
  return null;
}

function thresholdFor(stageLabel: string): number {
  const key = matchStageKey(stageLabel);
  return key ? STALE_THRESHOLDS[key] : STALE_DEFAULT_THRESHOLD;
}

export function dealStaleness(deal: Deal, now: number): DealStaleness {
  const days = daysInStage(deal, now);
  if (ON_HOLD_MATCH.test(deal.stageLabel)) {
    return {
      status: "on-hold",
      daysInStage: days,
      threshold: null,
      needsAttention: days > ON_HOLD_ATTENTION_DAYS,
    };
  }
  const threshold = thresholdFor(deal.stageLabel);
  const status: StaleStatus = days > threshold ? "stale" : days >= threshold * 0.5 ? "aging" : "fresh";
  return { status, daysInStage: days, threshold, needsAttention: status === "stale" };
}

export interface StaleEntry {
  deal: Deal;
  staleness: DealStaleness;
}

/** Open deals needing attention, biggest value × days first. */
export function staleDeals(deals: Deal[], now: number): StaleEntry[] {
  return deals
    .filter((d) => d.isOpen)
    .map((deal) => ({ deal, staleness: dealStaleness(deal, now) }))
    .filter((e) => e.staleness.needsAttention)
    .sort((a, b) => b.deal.value * b.staleness.daysInStage - a.deal.value * a.staleness.daysInStage);
}

/** Sort weight for the table's STATUS column — worst first under desc. */
export function severityRank(status: StaleStatus): number {
  switch (status) {
    case "stale":
      return 3;
    case "on-hold":
      return 2;
    case "aging":
      return 1;
    case "fresh":
      return 0;
  }
}
