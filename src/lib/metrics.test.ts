import { describe, expect, it } from "vitest";
import { dealForecastWeight, pipelineCoverage, weightedPipeline, weightedValue } from "./metrics";
import type { Deal } from "./types";

const DAY = 86_400_000;
const NOW = new Date(2026, 5, 10, 12).getTime(); // June 10, 2026 — inside Q2

function deal(over: Partial<Deal> & { id: string }): Deal {
  const createdAt = over.createdAt ?? NOW - 60 * DAY;
  return {
    name: `Deal ${over.id}`,
    amount: 50_000,
    value: 50_000,
    stageId: "x",
    stageLabel: "SQL",
    isOpen: true,
    entered: { sal: createdAt, sql: createdAt + DAY },
    createdAt,
    hubspotUrl: `https://example.com/${over.id}`,
    ...over,
  };
}

/** An open SQL deal worth `value`. */
const openSql = (id: string, value: number) => deal({ id, value });

/** A deal won `daysAgo` days ago worth `value`. */
function won(id: string, daysAgo: number, value: number): Deal {
  const ts = NOW - daysAgo * DAY;
  return deal({
    id,
    value,
    isOpen: false,
    stageLabel: "Closed Won",
    entered: { sal: ts - 90 * DAY, sql: ts - 80 * DAY, won: ts },
  });
}

describe("pipelineCoverage", () => {
  it("uses remaining-year math outside quarter view", () => {
    // $300K open; $200K won in March (YTD) → 300K ÷ (1.2M − 200K) = 0.3
    const deals = [openSql("a", 100_000), openSql("b", 200_000), won("w", 80, 200_000)];
    const c = pipelineCoverage(deals, "month", NOW);
    expect(c.open).toBe(300_000);
    expect(c.remaining).toBe(1_000_000);
    expect(c.ratio).toBeCloseTo(0.3);
    expect(c.scopeLabel).toBe("2026");
  });

  it("uses the quarter slice in quarter view", () => {
    // won 80 days ago = March = Q1, so Q2 has $0 won → remaining 300K
    const deals = [openSql("a", 150_000), won("w", 80, 200_000)];
    const c = pipelineCoverage(deals, "quarter", NOW);
    expect(c.remaining).toBe(300_000);
    expect(c.ratio).toBeCloseTo(0.5);
    expect(c.scopeLabel).toBe("Q2 2026");
    // a win inside Q2 reduces the quarter's remaining quota
    const c2 = pipelineCoverage([...deals, won("w2", 10, 100_000)], "quarter", NOW);
    expect(c2.remaining).toBe(200_000);
    expect(c2.ratio).toBeCloseTo(0.75);
  });

  it("returns null ratio when the quota is already met", () => {
    const c = pipelineCoverage([openSql("a", 50_000), won("w", 10, 400_000)], "quarter", NOW);
    expect(c.remaining).toBe(0);
    expect(c.ratio).toBeNull();
  });

  it("returns 0 when there is no open pipeline", () => {
    const c = pipelineCoverage([won("w", 80, 100_000)], "month", NOW);
    expect(c.open).toBe(0);
    expect(c.ratio).toBe(0);
  });
});

describe("dealForecastWeight / weightedValue / weightedPipeline", () => {
  const at = (label: string, value = 100_000, over: Partial<Deal> = {}) =>
    deal({ id: label + value, stageLabel: label, value, ...over });

  it("weights open deals by current stage, with the On Hold/unmatched default", () => {
    expect(dealForecastWeight(at("SAL (Discovery Booked)"))).toBe(0.05);
    expect(dealForecastWeight(at("SQL (Initiative Identified)"))).toBe(0.15);
    expect(dealForecastWeight(at("Deep Dive Demo"))).toBe(0.35);
    expect(dealForecastWeight(at("Review / Pilot"))).toBe(0.6);
    expect(dealForecastWeight(at("On Hold"))).toBe(0.05);
    expect(dealForecastWeight(at("Mystery Stage"))).toBe(0.05);
  });

  it("counts closed-won in full and closed-lost not at all", () => {
    const wonDeal = at("Closed Won", 100_000, { isOpen: false, entered: { sal: NOW - DAY, won: NOW } });
    const lostDeal = at("Closed Lost", 100_000, { isOpen: false, entered: { sal: NOW - DAY, lost: NOW } });
    expect(dealForecastWeight(wonDeal)).toBe(1);
    expect(dealForecastWeight(lostDeal)).toBe(0);
    expect(weightedValue([wonDeal, lostDeal])).toBe(100_000);
  });

  it("computes the open-book tile numbers", () => {
    const deals = [
      at("SAL (Discovery Booked)", 100_000), // 5K
      at("Review / Pilot", 50_000), // 30K
      at("Closed Won", 999_999, { isOpen: false, entered: { sal: NOW - DAY, won: NOW } }), // excluded: not open
    ];
    const w = weightedPipeline(deals);
    expect(w.rawOpen).toBe(150_000);
    expect(w.weightedOpen).toBe(35_000);
    expect(w.openDeals).toHaveLength(2);
  });

  it("weighted cohort value = expected value (wins full, losses zero, open by stage)", () => {
    const cohort = [
      at("SQL (Initiative Identified)", 100_000), // 15K
      at("Closed Won", 50_000, { isOpen: false, entered: { sal: NOW - DAY, won: NOW } }), // 50K
      at("Closed Lost", 80_000, { isOpen: false, entered: { sal: NOW - DAY, lost: NOW } }), // 0
    ];
    expect(weightedValue(cohort)).toBe(65_000);
  });
});
