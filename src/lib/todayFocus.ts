import { CONVERSION_TARGETS, STAGE_LABELS, dealUrl } from "./config";
import { fmtMoney, fmtPct } from "./format";
import { conversion, enteredInPeriod, valueEnteredBetween } from "./metrics";
import { dayOfPeriod, elapsedFraction, periodKey } from "./periods";
import type { Deal, GoalStage, StageGoal } from "./types";

/**
 * Today's Focus: turn the dashboard's diagnostics into the 3 highest-leverage
 * actions for today. Pure functions over the same payload the page already
 * has — no fetching, no DOM — so the scoring is unit-testable and reusable
 * (e.g. a future email digest).
 *
 * Severity is normalized to 0–100 within each category so categories can be
 * ranked against each other; one card per category (the worst offender) keeps
 * the panel prescribing three *different* levers instead of three copies of
 * the same one.
 */

const MS_DAY = 86_400_000;
const STALE_DAYS = 90;
const REVIVAL_WINDOW_DAYS = 90;
const REVIVAL_MIN_VALUE = 25_000;
const MILESTONE_STEP = 100_000;
const MILESTONE_NEAR = 0.05; // within 5%

export type FocusCategory = "STALE DEAL" | "PACING" | "CONVERSION" | "REVIVAL" | "GOAL";

export interface FocusInput {
  deals: Deal[];
  goals: Record<GoalStage, StageGoal>;
  now: number;
  pilotTracked: boolean;
}

export interface FocusAction {
  /** Stable id, used for per-day dismissal (e.g. "stale:12345"). */
  id: string;
  category: FocusCategory;
  /** Normalized 0–100 impact severity — the ranking key. */
  score: number;
  diagnosis: string;
  action: string;
  cta: {
    label: string;
    /** Absolute URL, or "#section:<name>" → smooth-scroll to that section. */
    href: string;
  };
}

const money = (n: number) => fmtMoney(n, { compact: true });

/** Days since the deal's last *tracked* stage entry — the best staleness proxy
 *  available (no stage-history or last-activity on the Deal shape). */
function daysSinceLastMove(d: Deal, now: number): number {
  const last = Math.max(...Object.values(d.entered));
  return Math.max(0, Math.floor((now - last) / MS_DAY));
}

function staleCandidate(input: FocusInput): FocusAction | null {
  let best: { deal: Deal; days: number; raw: number } | null = null;
  for (const deal of input.deals) {
    if (!deal.isOpen) continue;
    const days = daysSinceLastMove(deal, input.now);
    if (days <= STALE_DAYS) continue;
    const raw = deal.value * days;
    if (!best || raw > best.raw) best = { deal, days, raw };
  }
  if (!best) return null;
  // a $50K deal stale for a year saturates the scale
  const score = Math.min(100, (best.raw / (50_000 * 365)) * 100);
  return {
    id: `stale:${best.deal.id}`,
    category: "STALE DEAL",
    score,
    diagnosis: `${best.deal.name} has sat in ${best.deal.stageLabel} for ${best.days} days at ${money(best.deal.value)}.`,
    action: "Close-lost it or schedule a revival call — stop carrying it as pipeline.",
    cta: { label: "Open in HubSpot ↗", href: best.deal.hubspotUrl },
  };
}

function pacingCandidate(input: FocusInput): FocusAction | null {
  const monthKey = periodKey(input.now, "month");
  const elapsed = elapsedFraction(monthKey, input.now);
  const { day, total } = dayOfPeriod(monthKey, input.now);
  const daysLeft = Math.max(1, total - day);
  let best: FocusAction | null = null;
  for (const stage of Object.keys(input.goals) as GoalStage[]) {
    const goal = input.goals[stage].month;
    if (!goal) continue;
    const expected = goal * elapsed;
    if (expected < 1) continue; // too early in the month to call it
    const actual = enteredInPeriod(input.deals, stage, monthKey).count;
    const ratio = actual / expected;
    const remaining = goal - actual;
    if (ratio >= 0.6 || remaining < 2) continue;
    const score = (1 - ratio) * 100;
    if (best && score <= best.score) continue;
    const perDay = Math.round((remaining / daysLeft) * 10) / 10;
    const label = STAGE_LABELS[stage];
    best = {
      id: `pacing:${stage}:${monthKey}`,
      category: "PACING",
      score,
      diagnosis: `${label} is at ${actual} of ${goal} this month — ${Math.round(ratio * 100)}% of where the goal says you should be by today.`,
      action: `You need ${Math.round(remaining * 10) / 10} ${label}s in the next ${daysLeft} days — ${perDay} per day.`,
      cta: { label: "See pace detail", href: "#section:Pace to Goal" },
    };
  }
  return best;
}

function conversionCandidate(input: FocusInput): FocusAction | null {
  let best: FocusAction | null = null;
  for (const step of CONVERSION_TARGETS) {
    if ((step.from === "pilot" || step.to === "pilot") && !input.pilotTracked) continue;
    const c = conversion(input.deals, step.from, step.to, input.now);
    if (c.rate === null || c.cohort < 3) continue;
    if (c.rate >= step.rate * 0.5) continue;
    const score = (1 - c.rate / step.rate) * 100;
    if (best && score <= best.score) continue;
    const from = STAGE_LABELS[step.from];
    const to = STAGE_LABELS[step.to];
    best = {
      id: `conv:${step.from}-${step.to}`,
      category: "CONVERSION",
      score,
      diagnosis: `${from}→${to} is ${fmtPct(c.rate)} vs the ${fmtPct(step.rate)} target (${c.converted} of ${c.cohort} in 90 days).`,
      action: `Review the last ${c.cohort} ${from} notes for a common drop-off pattern.`,
      cta: { label: "See funnel leaks", href: "#section:Funnel Leaks" },
    };
  }
  return best;
}

function revivalCandidate(input: FocusInput): FocusAction | null {
  const since = input.now - REVIVAL_WINDOW_DAYS * MS_DAY;
  let best: { deal: Deal; daysAgo: number; score: number } | null = null;
  for (const deal of input.deals) {
    const lost = deal.entered.lost;
    if (lost === undefined || lost < since || lost > input.now) continue;
    if (deal.value <= REVIVAL_MIN_VALUE) continue;
    const daysAgo = Math.floor((input.now - lost) / MS_DAY);
    let score = Math.min(100, (deal.value / 100_000) * 100);
    if (daysAgo <= 30) score = Math.min(100, score * 1.2); // fresh losses revive easier
    if (!best || score > best.score) best = { deal, daysAgo, score };
  }
  if (!best) return null;
  return {
    id: `revival:${best.deal.id}`,
    category: "REVIVAL",
    score: best.score,
    diagnosis: `${best.deal.name} (${money(best.deal.value)}) closed lost ${best.daysAgo} ${best.daysAgo === 1 ? "day" : "days"} ago.`,
    action: "Send a revival check-in — ask what changed since, not for the sale.",
    cta: { label: "Open in HubSpot ↗", href: best.deal.hubspotUrl },
  };
}

function goalCandidate(input: FocusInput): FocusAction | null {
  const year = new Date(input.now).getFullYear();
  const yearStart = new Date(year, 0, 1).getTime();
  const metrics: { key: string; value: number; phrase: string; push: string }[] = [
    {
      key: "pipelineYtd",
      value: valueEnteredBetween(input.deals, "sql", yearStart, input.now).totalValue,
      phrase: "pipeline created YTD",
      push: "Close one more SQL this week to cross it.",
    },
    {
      key: "wonYtd",
      value: valueEnteredBetween(input.deals, "won", yearStart, input.now).totalValue,
      phrase: "closed-won YTD",
      push: "One more win crosses it.",
    },
  ];
  let best: FocusAction | null = null;
  for (const m of metrics) {
    if (m.value <= 0) continue;
    const milestone = Math.ceil(m.value / MILESTONE_STEP) * MILESTONE_STEP;
    const gap = milestone - m.value;
    if (gap <= 0 || gap > milestone * MILESTONE_NEAR) continue;
    // milestones are momentum, not urgency — weighted down vs the other categories
    const score = (1 - gap / (milestone * MILESTONE_NEAR)) * 100 * 0.6;
    if (best && score <= best.score) continue;
    best = {
      id: `goal:${m.key}:${milestone}`,
      category: "GOAL",
      score,
      diagnosis: `${money(m.value)} ${m.phrase} — ${money(gap)} short of the ${money(milestone)} milestone.`,
      action: m.push,
      cta: { label: "See revenue detail", href: "#section:Revenue" },
    };
  }
  return best;
}

/** All category winners, highest severity first. */
export function computeFocusActions(input: FocusInput): FocusAction[] {
  if (input.deals.length === 0) return []; // no data ≠ everything urgent
  return [
    staleCandidate(input),
    pacingCandidate(input),
    conversionCandidate(input),
    revivalCandidate(input),
    goalCandidate(input),
  ]
    .filter((a): a is FocusAction => a !== null)
    .sort((a, b) => b.score - a.score);
}

/** The panel's 3 cards: dismissed ids drop out and the next candidate fills in. */
export function topFocusActions(input: FocusInput, dismissed: ReadonlySet<string>): FocusAction[] {
  return computeFocusActions(input)
    .filter((a) => !dismissed.has(a.id))
    .slice(0, 3);
}

/** HubSpot deals index — the empty state's "go prospect" link. */
export function hubspotDealsUrl(): string {
  return dealUrl("").replace(/\/record\/0-3\/$/, "/objects/0-3/views/all/list");
}
