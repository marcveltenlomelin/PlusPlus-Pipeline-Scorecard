import { ARR_TARGET, CLOSE_RATE_TARGET, COVERAGE_TARGET, STAGE_LABELS } from "./config";
import { fmtMoney, fmtNum, fmtPct } from "./format";
import { headlineKpis, headlineWindows } from "./headline";
import { enteredInPeriod, pacingBadge, pipelineCoverage, valueEnteredBetween } from "./metrics";
import { periodKey, periodLabel, periodStart } from "./periods";
import { staleDeals } from "./stale";
import { topFocusActions } from "./todayFocus";
import type { Deal, DigestConfig, GoalStage, StageGoal } from "./types";

/**
 * Weekly digest content, built from the same pure libs the dashboard renders —
 * the reason those libs are DOM-free. Two variants: "full" for @plusplus.co
 * recipients (deal names included), "aggregate" for anyone else (counts and
 * values only).
 */

export type DigestVariant = "full" | "aggregate";

export interface DigestData {
  subject: string;
  weekLabel: string;
  variant: DigestVariant;
  focus: { category: string; diagnosis: string; action: string; href: string }[];
  kpis: { label: string; value: string; detail: string }[];
  funnel: { stage: string; count: number; goal: number | null; pace: string | null }[];
  stale: { rows: { name: string; stage: string; days: number; value: string }[]; count: number; totalValue: string };
  revenue: { label: string; value: string }[];
}

const money = (n: number) => fmtMoney(n, { compact: true });

/** Mon-anchored "Week of Jun 9, 2026" label for the subject. */
export function weekOfLabel(now: number): string {
  const start = periodStart(periodKey(now, "week"));
  return start.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

/** Should a cron firing at `now` send, given cadence + the last send? */
export function shouldSendNow(cadence: DigestConfig["cadence"], lastSentAt: number | undefined, now: number): boolean {
  if (lastSentAt === undefined) return true;
  const days = (now - lastSentAt) / 86_400_000;
  // generous lower bounds so clock jitter around the cron hour never double-skips
  if (cadence === "weekly") return days >= 6;
  if (cadence === "biweekly") return days >= 13;
  return days >= 27; // monthly
}

export function buildDigest(
  deals: Deal[],
  goals: Record<GoalStage, StageGoal>,
  now: number,
  variant: DigestVariant,
  pilotTracked: boolean
): DigestData {
  const year = new Date(now).getFullYear();
  const yearStart = new Date(year, 0, 1).getTime();
  const weekKey = periodKey(now, "week");

  // --- Today's Focus (hero) -------------------------------------------------
  const actions = topFocusActions({ deals, goals, now, pilotTracked }, new Set());
  const focus = actions.map((a) => ({
    category: a.category,
    diagnosis: variant === "full" ? a.diagnosis : redactNames(a.diagnosis, deals),
    action: variant === "full" ? a.action : "Open the scorecard for deal-level detail.",
    href: a.cta.href.startsWith("#") ? "" : variant === "full" ? a.cta.href : "",
  }));

  // --- KPI block --------------------------------------------------------------
  const t12m = headlineWindows(now, "month");
  const k = headlineKpis(deals, t12m.cur, t12m.prior);
  const cov = pipelineCoverage(deals, "month", now);
  const wonYtd = valueEnteredBetween(deals, "won", yearStart, now);
  const kpis: DigestData["kpis"] = [
    {
      label: "Win rate (T12M)",
      value: k.winRate.rate === null ? "—" : fmtPct(k.winRate.rate),
      detail: `${k.winRate.won} won · ${k.winRate.lost} lost · target ${fmtPct(CLOSE_RATE_TARGET)}`,
    },
    {
      label: "Avg sales cycle",
      value: k.cycle.median === null ? "N/A" : `${Math.round(k.cycle.median)} days`,
      detail: k.cycle.median === null ? "needs a first closed-won" : `P25–P75 ${Math.round(k.cycle.p25!)}–${Math.round(k.cycle.p75!)}d`,
    },
    {
      label: "Avg deal size",
      value: k.dealSize.mean === null ? "—" : money(k.dealSize.mean),
      detail: k.dealSize.median === null ? "no closed-won in window" : `median ${money(k.dealSize.median)}`,
    },
    {
      label: "Pipeline coverage",
      value: cov.ratio === null ? "Met" : `${cov.ratio.toFixed(1)}x`,
      detail: `${money(cov.open)} open ÷ ${money(cov.remaining)} remaining · target ≥ ${COVERAGE_TARGET.toFixed(1)}x`,
    },
    {
      label: `Closed won · ${year} YTD`,
      value: money(wonYtd.totalValue),
      detail: `${Math.round((wonYtd.totalValue / ARR_TARGET) * 100)}% of ${money(ARR_TARGET)} target`,
    },
  ];

  // --- Funnel block (this week) ----------------------------------------------
  const stages: GoalStage[] = ["sal", "sql", "deepdive", "pilot", "won"];
  const funnel = stages
    .filter((s) => s !== "pilot" || pilotTracked)
    .map((stage) => {
      const count = enteredInPeriod(deals, stage, weekKey).count;
      const goal = goals[stage] ? (goals[stage].month * 12) / 52 : null;
      const badge = pacingBadge(count, goal ?? undefined, weekKey, now);
      return {
        stage: STAGE_LABELS[stage],
        count,
        goal: goal === null ? null : Math.round(goal * 10) / 10,
        pace: badge ? badge.state.replace("-", " ") : null,
      };
    });

  // --- Stale block --------------------------------------------------------------
  const staleEntries = staleDeals(deals, now);
  const stale = {
    count: staleEntries.length,
    totalValue: money(staleEntries.reduce((s, e) => s + e.deal.value, 0)),
    rows: staleEntries.slice(0, 8).map((e) => ({
      name: variant === "full" ? e.deal.name : "(deal name hidden)",
      stage: e.deal.stageLabel,
      days: e.staleness.daysInStage,
      value: money(e.deal.value),
    })),
  };

  // --- Revenue line ---------------------------------------------------------
  const pipeYtd = valueEnteredBetween(deals, "sql", yearStart, now);
  const revenue = [
    { label: `Pipeline created · ${year} YTD`, value: money(pipeYtd.totalValue) },
    { label: "Open pipeline (entered SQL)", value: money(cov.open) },
    { label: `Closed won · ${year} YTD`, value: money(wonYtd.totalValue) },
  ];

  // --- Subject ---------------------------------------------------------------
  const weekLabel = weekOfLabel(now);
  const headline =
    stale.count > 0
      ? `${stale.count} stale ${stale.count === 1 ? "deal needs" : "deals need"} attention`
      : actions[0]
        ? actions[0].category === "PACING"
          ? "pacing behind goal"
          : actions[0].category.toLowerCase()
        : `${fmtNum(enteredInPeriod(deals, "sal", weekKey).count)} new SALs this week`;
  const subject = `PlusPlus Pipeline · Week of ${weekLabel} · ${headline}`;

  return { subject, weekLabel, variant, focus, kpis, funnel, stale, revenue };
}

/** Aggregate variant: replace any deal name appearing in text with a neutral phrase. */
function redactNames(text: string, deals: Deal[]): string {
  let out = text;
  for (const d of deals) {
    if (d.name && out.includes(d.name)) out = out.replaceAll(d.name, "A deal");
  }
  return out;
}
