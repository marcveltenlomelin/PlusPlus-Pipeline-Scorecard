import { ARR_TARGET, CLOSE_RATE_TARGET, COVERAGE_TARGET, STAGE_LABELS } from "./config";
import { fmtMoney, fmtNum, fmtPct } from "./format";
import { headlineKpis, headlineWindows } from "./headline";
import { enteredInPeriod, pacingBadge, pipelineCoverage, valueEnteredBetween } from "./metrics";
import { periodKey, periodLabel, periodStart, shiftPeriod } from "./periods";
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
  /** Per-SDR numbers for THIS WEEK — what each sourcing rep put up before the pipeline call. */
  sdrs: { name: string; sals: number; sqls: number; deepdives: number; pilots: number; pipe: string }[];
  stale: { rows: { name: string; stage: string; days: number; value: string }[]; count: number; totalValue: string };
  revenue: { label: string; value: string }[];
}

const money = (n: number) => fmtMoney(n, { compact: true });

/** The week the digest reports on: the PRIOR completed week. Sent Tuesday, it
 *  covers last Mon–Sun — not the current in-progress week (which on Tuesday is
 *  just a day or two of data). */
export function digestWeekKey(now: number): string {
  return shiftPeriod(periodKey(now, "week"), -1);
}

/** Mon-anchored "Week of Jun 1, 2026" label for the prior week. */
export function weekOfLabel(now: number): string {
  const start = periodStart(digestWeekKey(now));
  return start.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

/** The digest goes out Tuesdays (UTC); the daily cron self-gates to this so it
 *  doesn't depend on Vercel honoring a day-of-week cron expression (unreliable
 *  on the Hobby plan). */
export function isDigestDay(now: number): boolean {
  return new Date(now).getUTCDay() === 2; // 0=Sun … 2=Tue
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
  pilotTracked: boolean,
  /** Roster names always shown (a zero week is information before the call). */
  sdrRoster: string[] = []
): DigestData {
  const year = new Date(now).getFullYear();
  const yearStart = new Date(year, 0, 1).getTime();
  const weekKey = digestWeekKey(now); // the prior completed week — see digestWeekKey

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

  // --- By SDR (this week) -----------------------------------------------------
  // Weekly sourcing scoreboard for the pipeline call: every roster name shows
  // even at zero; names found on deals but missing from the roster show too;
  // Unassigned only appears when something slipped through this week.
  const sdrNames = [...new Set([...sdrRoster, ...deals.map((d) => d.sdr).filter((s): s is string => !!s)])];
  const weekly = (mine: Deal[], stage: GoalStage) => enteredInPeriod(mine, stage, weekKey).count;
  const sdrs = sdrNames
    .map((name) => {
      const mine = deals.filter((d) => d.sdr === name);
      return {
        name,
        sals: weekly(mine, "sal"),
        sqls: weekly(mine, "sql"),
        deepdives: weekly(mine, "deepdive"),
        pilots: weekly(mine, "pilot"),
        pipe: money(enteredInPeriod(mine, "sql", weekKey).totalValue),
      };
    })
    .sort((a, b) => b.sals - a.sals || a.name.localeCompare(b.name));
  const unassigned = deals.filter((d) => !d.sdr);
  const unassignedSals = weekly(unassigned, "sal");
  if (unassignedSals > 0) {
    sdrs.push({
      name: "Unassigned",
      sals: unassignedSals,
      sqls: weekly(unassigned, "sql"),
      deepdives: weekly(unassigned, "deepdive"),
      pilots: weekly(unassigned, "pilot"),
      pipe: money(enteredInPeriod(unassigned, "sql", weekKey).totalValue),
    });
  }

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
        : `${fmtNum(enteredInPeriod(deals, "sal", weekKey).count)} new SALs last week`;
  const subject = `PlusPlus Pipeline · Week of ${weekLabel} · ${headline}`;

  return { subject, weekLabel, variant, focus, kpis, funnel, sdrs, stale, revenue };
}

/** Aggregate variant: replace any deal name appearing in text with a neutral phrase. */
function redactNames(text: string, deals: Deal[]): string {
  let out = text;
  for (const d of deals) {
    if (d.name && out.includes(d.name)) out = out.replaceAll(d.name, "A deal");
  }
  return out;
}
