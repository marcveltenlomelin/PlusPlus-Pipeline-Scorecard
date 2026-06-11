import { describe, expect, it } from "vitest";
import { dealStaleness, staleDeals } from "./stale";
import type { Deal } from "./types";

const DAY = 86_400_000;
const NOW = new Date(2026, 5, 10, 12).getTime();

function deal(over: Partial<Deal> & { id: string; stageLabel: string; days: number }): Deal {
  const last = NOW - over.days * DAY;
  return {
    name: `Deal ${over.id}`,
    amount: 50_000,
    value: over.value ?? 50_000,
    stageId: "x",
    isOpen: true,
    entered: { sal: last },
    createdAt: last,
    hubspotUrl: `https://example.com/${over.id}`,
    ...over,
  };
}

describe("dealStaleness", () => {
  it("applies per-stage thresholds with the aging band at 50–100%", () => {
    // SAL threshold 30d: 14d fresh (47%), 15d aging (50%), 30d aging (100%), 31d stale
    expect(dealStaleness(deal({ id: "a", stageLabel: "SAL (Discovery Booked)", days: 14 }), NOW).status).toBe("fresh");
    expect(dealStaleness(deal({ id: "b", stageLabel: "SAL (Discovery Booked)", days: 15 }), NOW).status).toBe("aging");
    expect(dealStaleness(deal({ id: "c", stageLabel: "SAL (Discovery Booked)", days: 30 }), NOW).status).toBe("aging");
    const stale = dealStaleness(deal({ id: "d", stageLabel: "SAL (Discovery Booked)", days: 31 }), NOW);
    expect(stale.status).toBe("stale");
    expect(stale.needsAttention).toBe(true);
    expect(stale.threshold).toBe(30);
  });

  it("matches each stage label to its threshold", () => {
    expect(dealStaleness(deal({ id: "a", stageLabel: "SQL (Initiative Identified)", days: 46 }), NOW).status).toBe("stale");
    expect(dealStaleness(deal({ id: "b", stageLabel: "Deep Dive Demo", days: 60 }), NOW).status).toBe("aging");
    expect(dealStaleness(deal({ id: "c", stageLabel: "Review / Pilot", days: 91 }), NOW).status).toBe("stale");
  });

  it("gives unknown stages the 90d default instead of reading fresh", () => {
    const s = dealStaleness(deal({ id: "a", stageLabel: "Mystery Stage", days: 91 }), NOW);
    expect(s.threshold).toBe(90);
    expect(s.status).toBe("stale");
  });

  it("treats On Hold separately with the 180d attention gate", () => {
    const young = dealStaleness(deal({ id: "a", stageLabel: "On Hold", days: 100 }), NOW);
    expect(young.status).toBe("on-hold");
    expect(young.needsAttention).toBe(false);
    const old = dealStaleness(deal({ id: "b", stageLabel: "On Hold", days: 181 }), NOW);
    expect(old.status).toBe("on-hold");
    expect(old.needsAttention).toBe(true);
  });
});

describe("staleDeals", () => {
  it("returns only needs-attention deals, sorted by value × days", () => {
    const deals = [
      deal({ id: "small", stageLabel: "SAL (Discovery Booked)", days: 40, value: 10_000 }), // 400K
      deal({ id: "big", stageLabel: "SQL (Initiative Identified)", days: 50, value: 50_000 }), // 2.5M
      deal({ id: "fresh", stageLabel: "SAL (Discovery Booked)", days: 5 }),
      deal({ id: "parked", stageLabel: "On Hold", days: 100 }), // under the gate
      deal({ id: "closed", stageLabel: "SQL (Initiative Identified)", days: 200, isOpen: false }),
    ];
    const out = staleDeals(deals, NOW);
    expect(out.map((e) => e.deal.id)).toEqual(["big", "small"]);
  });
});
