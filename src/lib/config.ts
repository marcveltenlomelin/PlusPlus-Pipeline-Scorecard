import type { GoalStage, StageGoal, StageKey } from "./types";

/* ── HubSpot ──────────────────────────────────────────────────────────── */

export const HUBSPOT_PORTAL_ID = "3109109";
export const PIPELINE_ID = "default"; // "New Accounts"

/**
 * Stage-entry timestamp properties. These drive every throughput count.
 * SAL has no dedicated entry signal that covers every deal — createdate is
 * the SAL signal (a deal is created when a first meeting is booked).
 * Verified against portal 3109109 on 2026-06-09: SQL = "SQL (Initiative
 * Identified)", Deep Dive = "Deep Dive Demo".
 */
export const STAGE_ENTRY_PROPS: Partial<Record<StageKey, string>> = {
  sql: "hs_v2_date_entered_appointmentscheduled",
  deepdive: "hs_v2_date_entered_presentationscheduled",
  won: "hs_v2_date_entered_closedwon",
  lost: "hs_v2_date_entered_closedlost",
  pilot: "first_pilot_date",
};

/**
 * Pilot entry fallback. The brief assumed "Review / Pilot" (stage 29886531)
 * had no entry timestamp, but HubSpot's auto-generated
 * hs_v2_date_entered_29886531 is populated (34 deals incl. 2024 history,
 * verified 2026-06-09). first_pilot_date stays primary so a workflow can
 * override per deal; this fallback makes Pilot throughput work today.
 */
export const PILOT_ENTRY_FALLBACK_PROP = "hs_v2_date_entered_29886531";

/** Net New Opps are defined as SQL stage entries. Single source of truth. */
export const NET_NEW_OPP_STAGE: StageKey = "sql";

/**
 * Deals sometimes skip the SQL stage (e.g. Motive, Apr 2026: created straight
 * into Deep Dive). They have no SQL-entry timestamp, so a strict reading
 * undercounts Net New Opps and pipeline created. When true, a deal with no
 * SQL entry that reached a deeper funnel stage counts as entering SQL at its
 * first deeper-stage entry (Deep Dive, Pilot, or Closed Won — not Lost:
 * disqualified SALs are not opps). Flagged in the on-screen definitions.
 */
export const INFER_SKIPPED_SQL = true;

/** Deals with no amount count at this value. */
export const DEFAULT_DEAL_VALUE = 50_000;

/** Regex that picks the Pilot stage out of pipeline metadata (for occupancy). */
export const PILOT_STAGE_MATCH = /pilot/i;

/** Server-side fetch cache TTL. Manual refresh bypasses it. */
export const CACHE_TTL_MS = 5 * 60 * 1000;

/* ── Goals & targets (defaults — goals are editable in the UI) ────────── */

/**
 * The goal model: $1.2M ARR ÷ $50K average deal = 24 closed-won deals/year
 * (6/quarter, 2/month), worked backwards up the funnel with the conversion
 * targets below. 1 SDR feeds the top. Values are explicit per period (not
 * derived ×3/×12 — e.g. SQL is 6/19/75); weekly views derive month × 12⁄52.
 */
export const STAGE_GOALS: Record<GoalStage, StageGoal> = {
  sal: { month: 31, quarter: 94, year: 375 },
  sql: { month: 6, quarter: 19, year: 75 }, // = Net New Opps, 20% of SAL
  deepdive: { month: 5, quarter: 15, year: 60 }, // 80% of SQL
  pilot: { month: 4, quarter: 12, year: 48 }, // 80% of Deep Dive
  won: { month: 2, quarter: 6, year: 24 }, // 50% of Pilot
};

/** Stage-to-stage conversion targets shown next to actuals in the funnel. */
export const CONVERSION_TARGETS: { from: StageKey; to: StageKey; rate: number }[] = [
  { from: "sal", to: "sql", rate: 0.2 },
  { from: "sql", to: "deepdive", rate: 0.8 },
  { from: "deepdive", to: "pilot", rate: 0.8 },
  { from: "pilot", to: "won", rate: 0.5 },
];

/** A stage is "at risk" when actuals fall below this share of goal-to-date. */
export const AT_RISK_THRESHOLD = 0.75;

export const ARR_TARGET = 1_200_000; // net-new annual
export const AVG_DEAL_SIZE = 50_000; // drives the revenue math (24 wins × $50K)
export const PIPELINE_PACE_PER_MONTH = 200_000;
export const CLOSE_RATE_TARGET = 0.5;

/** Pipeline coverage (open pipeline ÷ remaining quota) thresholds. */
export const COVERAGE_TARGET = 3.0; // healthy SaaS benchmark
export const COVERAGE_WARN = 2.0; // below this = need more top-of-funnel

/* ── Stage win probabilities (weighted pipeline) ──────────────────────── */

/** Forecast weight of an open deal by current stage — value × probability. */
export const STAGE_WIN_PROBABILITY: Record<"sal" | "sql" | "deepdive" | "pilot", number> = {
  sal: 0.05,
  sql: 0.15,
  deepdive: 0.35,
  pilot: 0.6,
};

/** Open stages that don't match a funnel stage (e.g. On Hold) — parked ≈ SAL-grade. */
export const STAGE_WIN_PROBABILITY_DEFAULT = 0.05;

/* ── Stale-deal thresholds ────────────────────────────────────────────── */

/** Days in stage before a deal counts as stale, per funnel stage. */
export const STALE_THRESHOLDS = {
  sal: 30,
  sql: 45,
  deepdive: 60,
  pilot: 90,
} as const;

/** Stages that don't match a matcher below get this threshold (never "fresh by default"). */
export const STALE_DEFAULT_THRESHOLD = 90;

/** On Hold deals (parked deliberately) only demand attention past this age. */
export const ON_HOLD_ATTENTION_DAYS = 180;

/** Current-stage labels are free-form portal strings — match them to threshold keys. */
export const STALE_STAGE_MATCHERS: [keyof typeof STALE_THRESHOLDS, RegExp][] = [
  ["sal", /\bsal\b/i],
  ["sql", /\bsql\b/i],
  ["deepdive", /deep\s*dive/i],
  ["pilot", /pilot|review/i],
];

export const ON_HOLD_MATCH = /on\s*hold/i;

/** Trailing window for conversion and close-rate computations. */
export const TRAILING_WINDOW_DAYS = 90;

/* ── Display ──────────────────────────────────────────────────────────── */

export const STAGE_LABELS: Record<StageKey, string> = {
  sal: "SAL",
  sql: "SQL",
  deepdive: "Deep Dive",
  pilot: "Pilot",
  won: "Closed Won",
  lost: "Closed Lost",
};

export const FUNNEL_ORDER: StageKey[] = ["sal", "sql", "deepdive", "pilot"];

export function dealUrl(dealId: string): string {
  return `https://app.hubspot.com/contacts/${HUBSPOT_PORTAL_ID}/record/0-3/${dealId}`;
}

/** Inline definitions — every number on the dashboard can explain itself. */
export const DEFINITIONS: Record<string, string> = {
  "tp:sal":
    "Deals created in the period (HubSpot createdate). A deal is created when a first meeting is booked, so creation is the SAL signal — SAL has no stage-entry timestamp in HubSpot. This counts every deal that entered the funnel, including ones that have since advanced or closed, which is why it won't match the SAL column on the live board.",
  "tp:sql":
    "Deals that entered the SQL stage in the period (hs_v2_date_entered_appointmentscheduled). Counts stage entries, not current occupancy — deals that later advanced or closed still count here. Deals that skipped the SQL stage but reached a deeper one (Deep Dive, Pilot, or Closed Won) count from their first deeper-stage entry.",
  "tp:deepdive":
    "Deals that entered the Deep Dive Demo stage in the period (hs_v2_date_entered_presentationscheduled). Counts stage entries, not current occupancy.",
  "tp:pilot":
    "Deals that entered the Review / Pilot stage in the period. Uses first_pilot_date (workflow-set custom property) when present, otherwise HubSpot's own stage-entry timestamp for the stage (hs_v2_date_entered_29886531). Counts stage entries, not current occupancy.",
  "occ:pilot":
    "Deals sitting in the Review / Pilot stage right now. This is current occupancy, not period throughput — shown only because no deal in the portal carries a Pilot entry timestamp yet. The card switches to period throughput automatically once one exists.",
  "tp:won":
    "Deals that entered Closed Won in the period (hs_v2_date_entered_closedwon).",
  "tp:lost":
    "Deals that entered Closed Lost in the period (hs_v2_date_entered_closedlost).",
  nno: "Net New Opps = SQL stage entries in the period. Same number, sales-facing name.",
  closeRate:
    "Closed Won ÷ (Closed Won + Closed Lost), counting deals that closed in the trailing 90 days. Target 50%.",
  conv:
    "Of deals that entered the earlier stage in the trailing 90 days, the share that has since entered the later stage. Recent cohorts may still convert, so the latest reading can drift up.",
  pace:
    "Actual = entries so far this period. Expected = goal × share of the period elapsed. Projected = actual ÷ share elapsed (straight-line). On track when the projection meets the goal.",
  "rev:pipeline":
    "Sum of deal value for deals that entered SQL (Net New Opp) in the period, including deals that skipped SQL and went straight to a deeper stage. SALs are NOT pipeline — a deal contributes nothing here until it enters SQL or deeper. Deal value = HubSpot amount, or $50,000 when no amount is set.",
  "rev:pipelineYtd":
    "Pipeline created since Jan 1: sum of deal value for deals entering SQL this year, tracked against the $200K/month pace.",
  "rev:wonYtd":
    "Closed-won revenue since Jan 1: sum of deal value for deals entering Closed Won this year, against the $1.2M net-new ARR target.",
  "rev:projArr":
    "Closed-won YTD + (value of currently open deals that have entered SQL) × trailing-90-day close rate. A what-if at today's close rate, not a forecast model.",
  "rev:openPipeline":
    "Value of currently open deals that have entered SQL — the live pipeline behind the projection. Deals still sitting in SAL are excluded until they convert.",
  "rev:weighted":
    "Open pipe weighted by historical stage conversion. Use this for forecast, raw pipe for activity. Sum over ALL open deals of value × current-stage win probability (SAL 5% · SQL 15% · Deep Dive 35% · Pilot 60% · other open stages incl. On Hold 5%). Broader set than the Coverage tile's open pipeline, which counts only deals that entered SQL.",
  "rev:coverage":
    "Open pipeline (deals that entered SQL, still open) ÷ remaining quota (the $1.2M annual target minus closed-won YTD; quarter view uses the quarter's $300K slice minus closed-won this quarter). Healthy SaaS pipelines run 3–4× coverage. Below 2× signals you need more top-of-funnel. Target ≥ 3.0×.",
  goal: "Goals come from the goal model: $1.2M ARR ÷ $50K average deal = 24 closed-won deals/year, worked backwards up the funnel (Pilot→Won 50%, Deep Dive→Pilot 80%, SQL→Deep Dive 80%, SAL→SQL 20%). Monthly, quarterly, and annual goals are set explicitly per stage and editable by hand; weekly views derive monthly × 12 ÷ 52.",
  atRisk:
    "Flagged when actuals fall below 75% of the goal — prorated to the share of the period elapsed for the period in progress (e.g. mid-month, the bar is 75% of half the goal).",
  convTarget:
    "Target rates from the goal model: SAL→SQL 20%, SQL→Deep Dive 80%, Deep Dive→Pilot 80%, Pilot→Closed Won 50%.",
  "rev:math":
    "Closed-won deals this calendar year, straight-line projected to Dec 31, × $50K average deal size, against the $1.2M ARR target. A pace read on deal count — the tiles above track actual dollar values.",
};
