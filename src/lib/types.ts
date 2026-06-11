/** Funnel stages tracked by the dashboard. Order matters (funnel order). */
export type StageKey = "sal" | "sql" | "deepdive" | "pilot" | "won" | "lost";

export type Granularity = "week" | "month" | "quarter" | "year";

/** Funnel stages that carry goals (Closed Lost has none). */
export type GoalStage = "sal" | "sql" | "deepdive" | "pilot" | "won";

export interface StageGoal {
  month: number;
  quarter: number;
  year: number;
}

/** A normalized deal — the only shape the UI ever sees. */
export interface Deal {
  id: string;
  name: string;
  /** HubSpot owner id (hubspot_owner_id); absent when unassigned. */
  ownerId?: string;
  /** Resolved owner name; absent when the owners API scope is missing. */
  ownerName?: string;
  /** Sourcing SDR (custom sourcing_sdr property — written by this dashboard). */
  sdr?: string;
  /** Raw HubSpot amount; null when not set on the deal. */
  amount: number | null;
  /** amount when set, otherwise DEFAULT_DEAL_VALUE. */
  value: number;
  /** Current HubSpot stage internal id. */
  stageId: string;
  /** Human label for the current stage (from pipeline metadata). */
  stageLabel: string;
  /** False once the deal is in Closed Won or Closed Lost. */
  isOpen: boolean;
  /** Epoch ms the deal entered each stage. `sal` is always createdate. */
  entered: Partial<Record<StageKey, number>>;
  createdAt: number;
  hubspotUrl: string;
}

export interface DealsPayload {
  deals: Deal[];
  /** When the data was actually pulled from HubSpot (epoch ms). */
  fetchedAt: number;
  /** live = fresh from HubSpot; cache = last good fetch (live failed); demo = no token. */
  source: "live" | "cache" | "demo";
  /** True once any deal carries first_pilot_date — flips Pilot from occupancy to throughput. */
  pilotTracked: boolean;
  /** Present when source === "cache": why the live fetch failed. */
  error?: string;
}

export interface Override {
  value: number;
  note?: string;
  at: number;
}

export type DigestCadence = "weekly" | "biweekly" | "monthly";

/** Email-digest section toggles, in render order. */
export type DigestSection = "headline" | "focus" | "funnel" | "sdr" | "leaks" | "revenue" | "stale";

export interface DigestConfig {
  recipients: string[];
  cadence: DigestCadence;
  sections: Record<DigestSection, boolean>;
  /** Epoch ms of the last successful cron send — drives bi-weekly/monthly skips. */
  lastSentAt?: number;
}

/** Digest defaults — weekly, every section on, nobody subscribed yet. */
export function defaultDigest(): DigestConfig {
  return {
    recipients: [],
    cadence: "weekly",
    sections: { headline: true, focus: true, funnel: true, sdr: true, leaks: true, revenue: true, stale: true },
  };
}

export interface Store {
  /**
   * Per-stage goals at month/quarter/year (explicit values from the goal
   * model, not derived multiples). Weekly views derive month × 12⁄52.
   */
  goals: Record<GoalStage, StageGoal>;
  /** Manual overrides keyed by metric cell id, e.g. "tp:sal:2026-06". */
  overrides: Record<string, Override>;
  /**
   * SDR roster — the *assignable* sourcing names. Assignments themselves live
   * on the deal (HubSpot custom property `sourcing_sdr`, written by this
   * dashboard) — the roster is just the pick-list. Names are the identity.
   */
  sdrs: string[];
  /** Weekly email digest configuration. */
  digest: DigestConfig;
}

/** PATCH body for /api/store — additive keys only; existing shape is load-bearing. */
export interface StorePatch {
  goals?: Partial<Record<GoalStage, Partial<StageGoal>>>;
  setOverrides?: Record<string, Override>;
  clearOverrides?: string[];
  addSdrs?: string[];
  /** Roster-only removal — deals keep their HubSpot-side attribution. */
  removeSdrs?: string[];
  /** Shallow-merged digest settings; `sections` merges per-key. */
  digest?: Partial<Omit<DigestConfig, "sections">> & {
    sections?: Partial<Record<DigestSection, boolean>>;
  };
}
