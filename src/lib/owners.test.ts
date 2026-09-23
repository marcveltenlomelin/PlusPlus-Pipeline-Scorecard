import { describe, expect, it } from "vitest";
import { activeOwners, ownerDisplayName, ownerRollup, sdrOwnerOf, UNASSIGNED_ID } from "./owners";
import { periodKey, shiftPeriod } from "./periods";
import type { Deal } from "./types";

const DAY = 86_400_000;
const NOW = new Date(2026, 5, 10, 12).getTime();

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

describe("ownerRollup (cumulative sourced funnel)", () => {
  it("credits every stage a sourced deal has ever reached, across months", () => {
    // the Motive/Hanna shape: SQL + Deep Dive in April, Pilot in May, viewed in June
    const apr = NOW - 57 * DAY;
    const may = NOW - 27 * DAY;
    const deals = [
      deal({
        id: "m1",
        sdr: "Milos",
        createdAt: apr,
        entered: { sal: apr, sql: apr, deepdive: apr, pilot: may },
        stageLabel: "Review / Pilot",
      }),
    ];
    const rows = ownerRollup(deals, sdrOwnerOf);
    const milos = rows[0];
    expect(milos.owner.name).toBe("Milos");
    expect(milos.openDeals).toBe(1);
    expect(milos.sals).toBe(1);
    expect(milos.sqls).toBe(1);
    expect(milos.deepdives).toBe(1);
    expect(milos.pilots).toBe(1);
    expect(milos.won).toBe(0);
    expect(milos.pipeValue).toBe(50_000); // entered SQL ever → counts
  });

  it("sorts by all-time pipe $ sourced, desc", () => {
    const old = NOW - 200 * DAY;
    const deals = [
      deal({ id: "a1", ...A, createdAt: old, entered: { sal: old, sql: old }, value: 80_000 }),
      deal({ id: "b1", ...B, createdAt: old, entered: { sal: old } }),
      deal({ id: "b2", ...B, createdAt: old, entered: { sal: old, sql: old }, value: 30_000 }),
    ];
    const rows = ownerRollup(deals);
    expect(rows[0].owner.name).toBe("Alex"); // 80K > 30K
    expect(rows[0].sqls).toBe(1);
    expect(rows[0].pipeValue).toBe(80_000);
    expect(rows[1].owner.name).toBe("Sam");
    expect(rows[1].sals).toBe(2);
    expect(rows[1].pipeValue).toBe(30_000);
  });

  it("computes all-time win rate over the sourced cohort", () => {
    const wonAt = NOW - 400 * DAY; // outside any trailing window — still counts
    const deals = [
      deal({ id: "a1", ...A, isOpen: false, entered: { sal: wonAt - 60 * DAY, won: wonAt } }),
      deal({ id: "a2", ...A, isOpen: false, entered: { sal: wonAt - 60 * DAY, lost: wonAt } }),
      deal({ id: "b1", ...B }), // open, nothing closed
    ];
    const rows = ownerRollup(deals);
    const alex = rows.find((r) => r.owner.name === "Alex")!;
    expect(alex.winRate).toBeCloseTo(0.5);
    expect(alex.wonLost).toEqual({ won: 1, lost: 1 });
    const sam = rows.find((r) => r.owner.name === "Sam")!;
    expect(sam.winRate).toBeNull();
  });

  it("handles the single-owner book", () => {
    expect(ownerRollup([deal({ id: "a1", ...A })])).toHaveLength(1);
  });

  it("rolls up by SDR attribution read from the deals themselves", () => {
    const sal = NOW - 3 * DAY;
    const deals = [
      // sdr cuts across HubSpot owners: Ana sourced d1+d3, d2 unassigned
      deal({ id: "d1", ...A, sdr: "Ana", createdAt: sal, entered: { sal, sql: NOW - DAY }, value: 70_000 }),
      deal({ id: "d2", ...A, createdAt: sal, entered: { sal } }),
      deal({ id: "d3", ...B, sdr: "Ana", createdAt: sal, entered: { sal } }),
    ];
    const rows = ownerRollup(deals, sdrOwnerOf);
    expect(rows.map((r) => r.owner.name)).toEqual(["Ana", "Unassigned"]);
    expect(rows[0].sals).toBe(2);
    expect(rows[0].pipeValue).toBe(70_000);
    expect(rows[0].openDeals).toBe(2);
    expect(rows[1].sals).toBe(1);
  });
});

describe("ownerRollup — timeframe scope", () => {
  const THIS_MONTH = periodKey(NOW, "month"); // 2026-06
  const LAST_MONTH = shiftPeriod(THIS_MONTH, -1); // 2026-05
  const may = new Date(2026, 4, 12).getTime();
  const jun = new Date(2026, 5, 3).getTime();
  // Milos: one deal created + SQL'd in May, then Deep Dive in June; one fresh June SAL.
  const deals = [
    deal({ id: "m1", sdr: "Milos", createdAt: may, entered: { sal: may, sql: may + DAY, deepdive: jun } }),
    deal({ id: "m2", sdr: "Milos", createdAt: jun, entered: { sal: jun } }),
    deal({ id: "u1", createdAt: may, entered: { sal: may } }), // unassigned, May
  ];

  it("default (no opts) is the cumulative all-time rollup — guards the June fix", () => {
    const [milos] = ownerRollup(deals, sdrOwnerOf);
    expect(milos.owner.name).toBe("Milos");
    expect(milos.sals).toBe(2);
    expect(milos.sqls).toBe(1);
    expect(milos.deepdives).toBe(1);
    expect(milos.pipeValue).toBe(50_000);
    expect(ownerRollup(deals, sdrOwnerOf, { scope: { kind: "all" } })).toEqual(ownerRollup(deals, sdrOwnerOf));
  });

  it("period scope counts only stage ENTRIES inside that period", () => {
    const [june] = ownerRollup(deals, sdrOwnerOf, { scope: { kind: "period", key: THIS_MONTH } });
    expect(june.sals).toBe(1); // m2 created in June; m1 was May
    expect(june.sqls).toBe(0); // m1's SQL entry was May
    expect(june.deepdives).toBe(1); // m1 entered Deep Dive in June
    expect(june.pipeValue).toBe(0); // no SQL entries in June
    const [mayRow] = ownerRollup(deals, sdrOwnerOf, { scope: { kind: "period", key: LAST_MONTH } });
    expect(mayRow.sals).toBe(1);
    expect(mayRow.sqls).toBe(1);
    expect(mayRow.deepdives).toBe(0);
    expect(mayRow.pipeValue).toBe(50_000);
  });

  it("openDeals is owned-right-now in every scope", () => {
    const all = ownerRollup(deals, sdrOwnerOf)[0];
    const june = ownerRollup(deals, sdrOwnerOf, { scope: { kind: "period", key: THIS_MONTH } })[0];
    expect(all.openDeals).toBe(2);
    expect(june.openDeals).toBe(2);
  });

  it("period win rate uses closes inside the period only", () => {
    const won = deal({ id: "w", sdr: "Milos", isOpen: false, createdAt: may, entered: { sal: may, won: jun } });
    const lostMay = deal({ id: "l", sdr: "Milos", isOpen: false, createdAt: may, entered: { sal: may, lost: may + 2 * DAY } });
    const [june] = ownerRollup([won, lostMay], sdrOwnerOf, { scope: { kind: "period", key: THIS_MONTH } });
    expect(june.wonLost).toEqual({ won: 1, lost: 0 });
    expect(june.winRate).toBe(1);
    const [all] = ownerRollup([won, lostMay], sdrOwnerOf);
    expect(all.winRate).toBeCloseTo(0.5);
  });

  it("extraOwners (the roster) get zero rows, sorted after real activity but before Unassigned", () => {
    const rows = ownerRollup(deals, sdrOwnerOf, {
      scope: { kind: "period", key: THIS_MONTH },
      extraOwners: [{ id: "Sam", name: "Sam" }],
    });
    expect(rows.map((r) => r.owner.name)).toEqual(["Milos", "Sam", "Unassigned"]);
    const sam = rows[1];
    expect(sam.sals + sam.sqls + sam.deepdives + sam.pilots + sam.won).toBe(0);
    expect(sam.openDeals).toBe(0);
    // an extra owner that already has deals is not duplicated
    const dup = ownerRollup(deals, sdrOwnerOf, { extraOwners: [{ id: "Milos", name: "Milos" }] });
    expect(dup.filter((r) => r.owner.name === "Milos")).toHaveLength(1);
  });
});
