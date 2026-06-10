import { describe, expect, it } from "vitest";
import { headlineKpis, headlineWindows, quantile } from "./headline";
import type { Deal } from "./types";

const DAY = 86_400_000;
const NOW = new Date(2026, 5, 10, 12).getTime(); // June 10, 2026 local

function deal(over: Partial<Deal> & { id: string }): Deal {
  const createdAt = over.createdAt ?? NOW - 100 * DAY;
  return {
    name: `Deal ${over.id}`,
    amount: 50_000,
    value: 50_000,
    stageId: "x",
    stageLabel: "Closed Won",
    isOpen: false,
    entered: { sal: createdAt },
    createdAt,
    hubspotUrl: `https://example.com/${over.id}`,
    ...over,
  };
}

/** A deal won `wonDaysAgo` days ago with a `cycle`-day SAL→won span. */
function win(id: string, wonDaysAgo: number, cycle: number, value = 50_000): Deal {
  const won = NOW - wonDaysAgo * DAY;
  const created = won - cycle * DAY;
  return deal({ id, value, createdAt: created, entered: { sal: created, won } });
}

function loss(id: string, lostDaysAgo: number): Deal {
  const lost = NOW - lostDaysAgo * DAY;
  return deal({ id, stageLabel: "Closed Lost", entered: { sal: lost - 30 * DAY, lost }, createdAt: lost - 30 * DAY });
}

describe("quantile", () => {
  it("handles odd, even, and single-element arrays", () => {
    expect(quantile([1, 2, 3], 0.5)).toBe(2);
    expect(quantile([1, 2, 3, 4], 0.5)).toBe(2.5);
    expect(quantile([7], 0.25)).toBe(7);
    expect(quantile([0, 10], 0.25)).toBe(2.5);
  });
});

describe("headlineWindows", () => {
  it("uses trailing 12 calendar months outside year view", () => {
    const w = headlineWindows(NOW, "month");
    expect(new Date(w.cur.start).getFullYear()).toBe(2025);
    expect(new Date(w.cur.start).getMonth()).toBe(5); // June 2025
    expect(w.cur.end).toBe(NOW);
    expect(w.prior.end).toBe(w.cur.start);
    expect(w.label).toBe("Trailing 12 Months");
  });

  it("year view compares YTD against the same span of the prior year", () => {
    const w = headlineWindows(NOW, "year");
    expect(new Date(w.cur.start).getMonth()).toBe(0);
    expect(new Date(w.prior.start).getFullYear()).toBe(2025);
    const priorEnd = new Date(w.prior.end);
    expect(priorEnd.getMonth()).toBe(5);
    expect(priorEnd.getDate()).toBe(10); // June 10, 2025 — not Dec 31
    expect(w.label).toBe("2026 YTD");
  });
});

describe("headlineKpis", () => {
  const { cur, prior } = headlineWindows(NOW, "month");

  it("returns nulls when nothing closed in the window", () => {
    const open = deal({ id: "o1", isOpen: true, stageLabel: "On Hold" });
    const k = headlineKpis([open], cur, prior);
    expect(k.winRate.rate).toBeNull();
    expect(k.cycle.median).toBeNull();
    expect(k.dealSize.mean).toBeNull();
  });

  it("computes windowed win rate and ignores closes outside the window", () => {
    const deals = [
      win("w1", 30, 90),
      win("w2", 60, 120),
      loss("l1", 10),
      win("w-old", 400, 80), // closed 400 days ago — prior window, not current
    ];
    const k = headlineKpis(deals, cur, prior);
    expect(k.winRate.won).toBe(2);
    expect(k.winRate.lost).toBe(1);
    expect(k.winRate.rate).toBeCloseTo(2 / 3);
    // the old win lands in the prior window: 1 won, 0 lost
    expect(k.winRate.priorRate).toBe(1);
  });

  it("computes cycle median/quartiles and prior median", () => {
    const deals = [win("a", 10, 60), win("b", 20, 90), win("c", 30, 150), win("old", 400, 200)];
    const k = headlineKpis(deals, cur, prior);
    expect(k.cycle.wins).toBe(3);
    expect(k.cycle.median).toBe(90);
    expect(k.cycle.p25).toBe(75);
    expect(k.cycle.p75).toBe(120);
    expect(k.cycle.priorMedian).toBe(200);
  });

  it("computes deal-size mean and median with prior comparison", () => {
    const deals = [win("a", 10, 60, 30_000), win("b", 20, 90, 60_000), win("old", 400, 100, 100_000)];
    const k = headlineKpis(deals, cur, prior);
    expect(k.dealSize.mean).toBe(45_000);
    expect(k.dealSize.median).toBe(45_000);
    expect(k.dealSize.priorMean).toBe(100_000);
  });
});
