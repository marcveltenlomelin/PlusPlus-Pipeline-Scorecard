import type { Deal } from "./types";

/**
 * Pure filter/sort logic for the Open Deals table. Kept out of the component
 * so the table stays thin (see CLAUDE.md conventions). Everything here is a
 * pure function of (deals, filters, now).
 */

export type SortKey = "name" | "stage" | "value" | "created" | "age";
export type SortDir = "asc" | "desc";

/** Default direction applied the first time a column is sorted. */
export const DEFAULT_SORT_DIR: Record<SortKey, SortDir> = {
  name: "asc",
  stage: "asc",
  value: "desc",
  created: "desc",
  age: "desc", // stalest deals first
};

const DAY = 86_400_000;

/** Numeric age in whole days. (format.ts `daysAgo` returns a string — unusable for math.) */
export function ageDays(createdAt: number, now: number): number {
  return Math.max(0, Math.floor((now - createdAt) / DAY));
}

export interface AgeBucket {
  key: string;
  label: string;
  test: (days: number) => boolean;
}

/** Ordered age buckets for the chip row. */
export const AGE_BUCKETS: AgeBucket[] = [
  { key: "lt30", label: "<30d", test: (d) => d < 30 },
  { key: "30to90", label: "30–90d", test: (d) => d >= 30 && d < 90 },
  { key: "90to180", label: "90–180d", test: (d) => d >= 90 && d < 180 },
  { key: "gt180", label: ">180d", test: (d) => d >= 180 },
];

export interface ValueChip {
  key: string;
  label: string;
  min: number | null;
  max: number | null;
}

/** Quick value-range presets. min/max in raw dollars; null = unbounded. */
export const VALUE_CHIPS: ValueChip[] = [
  { key: "lt10k", label: "<$10K", min: null, max: 10_000 },
  { key: "10to50k", label: "$10–50K", min: 10_000, max: 50_000 },
  { key: "gt50k", label: ">$50K", min: 50_000, max: null },
];

export interface OpenDealFilters {
  search: string;
  /** Selected stage labels. Treated as "all" when it covers every present stage. */
  stages: Set<string>;
  valueMin: number | null;
  valueMax: number | null;
  /** Selected AGE_BUCKETS keys. Empty = no age constraint. */
  ageBuckets: Set<string>;
}

/** Filter open deals. Controls AND together; age buckets OR within themselves. */
export function filterOpenDeals(deals: Deal[], f: OpenDealFilters, now: number): Deal[] {
  const q = f.search.trim().toLowerCase();
  const allStages = new Set(deals.map((d) => d.stageLabel));
  // No filter only when every present stage is selected. A strict subset
  // (including the empty set → match nothing) is an active constraint.
  const stageActive = ![...allStages].every((s) => f.stages.has(s));
  const ageTests = AGE_BUCKETS.filter((b) => f.ageBuckets.has(b.key));

  return deals.filter((d) => {
    if (q && !d.name.toLowerCase().includes(q)) return false;
    if (stageActive && !f.stages.has(d.stageLabel)) return false;
    if (f.valueMin !== null && d.value < f.valueMin) return false;
    if (f.valueMax !== null && d.value > f.valueMax) return false;
    if (ageTests.length > 0) {
      const days = ageDays(d.createdAt, now);
      if (!ageTests.some((b) => b.test(days))) return false;
    }
    return true;
  });
}

/** Sort open deals by a column. Returns a new array. */
export function sortOpenDeals(deals: Deal[], key: SortKey, dir: SortDir, now: number): Deal[] {
  const mul = dir === "asc" ? 1 : -1;
  const cmp = (a: Deal, b: Deal): number => {
    switch (key) {
      case "name":
        return a.name.localeCompare(b.name);
      case "stage":
        return a.stageLabel.localeCompare(b.stageLabel);
      case "value":
        return a.value - b.value;
      case "created":
        return a.createdAt - b.createdAt;
      case "age":
        // age is the inverse of createdAt; older = larger age
        return ageDays(a.createdAt, now) - ageDays(b.createdAt, now);
    }
  };
  return [...deals].sort((a, b) => mul * cmp(a, b));
}
