import { describe, expect, it } from "vitest";
import { activeOwners, ownerDisplayName, ownerRollup, UNASSIGNED_ID } from "./owners";
import { periodKey } from "./periods";
import type { Deal } from "./types";

const DAY = 86_400_000;
const NOW = new Date(2026, 5, 10, 12).getTime();
const MONTH = periodKey(NOW, "month");

function deal(over: Partial<Deal> & { id: string }): Deal {
  const createdAt = over.createdAt ?? NOW - 5 * DAY;
  return {
    name: `Deal ${over.id}`,
    amount: 50_000,
    value: 50_000,
    stageId: "x",
    stageLabel: "SQL",
    isOpen: true,
    entered: { sal: createdAt },
    createdAt,
    hubspotUrl: `https://example.com/${over.id}`,
    ...over,
  };
}

const A = { ownerId: "111", ownerName: "Alex" };
const B = { ownerId: "222", ownerName: "Sam" };

describe("ownerDisplayName / activeOwners", () => {
  it("falls back to a short id when names are unresolved, Unassigned last", () => {
    const deals = [
      deal({ id: "1", ownerId: "23360912" }), // no name (scope missing)
      deal({ id: "2", ...A }),
      deal({ id: "3" }), // no owner at all
    ];
    expect(ownerDisplayName(deals[0])).toBe("Owner 0912");
    const owners = activeOwners(deals);
    expect(owners).toHaveLength(3);
    expect(owners[owners.length - 1].id).toBe(UNASSIGNED_ID);
  });
});

describe("ownerRollup", () => {
  it("counts period volumes per owner and sorts by pipe $ desc", () => {
    const sal = NOW - 3 * DAY;
    const deals = [
      // Alex: 1 SAL + 1 SQL this month at $80K
      deal({ id: "a1", ...A, createdAt: sal, entered: { sal, sql: NOW - 2 * DAY }, value: 80_000 }),
      // Sam: 2 SALs, 1 SQL at $30K
      deal({ id: "b1", ...B, createdAt: sal, entered: { sal } }),
      deal({ id: "b2", ...B, createdAt: sal, entered: { sal, sql: NOW - DAY }, value: 30_000 }),
    ];
    const rows = ownerRollup(deals, MONTH, NOW);
    expect(rows[0].owner.name).toBe("Alex"); // 80K > 30K
    expect(rows[0].sals).toBe(1);
    expect(rows[0].sqls).toBe(1);
    expect(rows[0].pipeValue).toBe(80_000);
    expect(rows[1].owner.name).toBe("Sam");
    expect(rows[1].sals).toBe(2);
    expect(rows[1].pipeValue).toBe(30_000);
  });

  it("computes T12M win rate per owner independent of the period", () => {
    const wonAt = NOW - 100 * DAY;
    const deals = [
      deal({ id: "a1", ...A, isOpen: false, entered: { sal: wonAt - 60 * DAY, won: wonAt } }),
      deal({ id: "a2", ...A, isOpen: false, entered: { sal: wonAt - 60 * DAY, lost: wonAt } }),
      deal({ id: "b1", ...B }), // open, nothing closed
    ];
    const rows = ownerRollup(deals, MONTH, NOW);
    const alex = rows.find((r) => r.owner.name === "Alex")!;
    expect(alex.winRateT12M).toBeCloseTo(0.5);
    expect(alex.wonLostT12M).toEqual({ won: 1, lost: 1 });
    const sam = rows.find((r) => r.owner.name === "Sam")!;
    expect(sam.winRateT12M).toBeNull();
  });

  it("handles the single-owner book", () => {
    const rows = ownerRollup([deal({ id: "a1", ...A })], MONTH, NOW);
    expect(rows).toHaveLength(1);
  });

  it("rolls up by SDR attribution when given an ownerOf selector", async () => {
    const { sdrOwnerOf } = await import("./owners");
    const sal = NOW - 3 * DAY;
    const deals = [
      deal({ id: "d1", ...A, createdAt: sal, entered: { sal, sql: NOW - DAY }, value: 70_000 }),
      deal({ id: "d2", ...A, createdAt: sal, entered: { sal } }),
      deal({ id: "d3", ...B, createdAt: sal, entered: { sal } }),
    ];
    // SDR map cuts across HubSpot owners: Ana sourced d1+d3, d2 unassigned
    const rows = ownerRollup(deals, MONTH, NOW, sdrOwnerOf({ d1: "Ana", d3: "Ana" }));
    expect(rows.map((r) => r.owner.name)).toEqual(["Ana", "Unassigned"]);
    expect(rows[0].sals).toBe(2);
    expect(rows[0].pipeValue).toBe(70_000);
    expect(rows[1].sals).toBe(1);
  });
});
