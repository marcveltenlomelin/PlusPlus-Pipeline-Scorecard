import { describe, expect, it } from "vitest";
import { closeRateAt, conversionAt, conversionTrendRows } from "./conversionTrend";
import type { Deal } from "./types";

const DAY = 86_400_000;
const NOW = new Date(2026, 5, 10, 12).getTime();

function deal(over: Partial<Deal> & { id: string }): Deal {
  const createdAt = over.createdAt ?? NOW - 30 * DAY;
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

describe("conversionAt (point-in-time)", () => {
  it("does not count conversions that happened after the marker", () => {
    const sal = NOW - 80 * DAY;
    const d = deal({ id: "a", createdAt: sal, entered: { sal, sql: NOW - 10 * DAY } });
    // marker 30 days ago: deal is in the cohort, but its SQL entry (10d ago) is later
    const early = conversionAt([d], "sal", "sql", NOW - 30 * DAY);
    expect(early.den).toBe(1);
    expect(early.num).toBe(0);
    // marker now: conversion has happened
    const late = conversionAt([d], "sal", "sql", NOW);
    expect(late.num).toBe(1);
    expect(late.rate).toBe(1);
  });

  it("excludes cohort entries older than the 90-day window", () => {
    const sal = NOW - 91 * DAY;
    const d = deal({ id: "a", createdAt: sal, entered: { sal, sql: sal + DAY } });
    expect(conversionAt([d], "sal", "sql", NOW).den).toBe(0);
    expect(conversionAt([d], "sal", "sql", NOW).rate).toBeNull();
  });

  it("flags low sample below 5 attempts", () => {
    const sal = NOW - 30 * DAY;
    const four = [1, 2, 3, 4].map((n) => deal({ id: `d${n}`, createdAt: sal, entered: { sal } }));
    expect(conversionAt(four, "sal", "sql", NOW).lowSample).toBe(true);
    const five = [...four, deal({ id: "d5", createdAt: sal, entered: { sal } })];
    expect(conversionAt(five, "sal", "sql", NOW).lowSample).toBe(false);
  });
});

describe("closeRateAt", () => {
  it("computes won ÷ closed within the window as of the marker", () => {
    const mk = (id: string, k: "won" | "lost", daysAgo: number) =>
      deal({ id, isOpen: false, entered: { sal: NOW - 200 * DAY, [k]: NOW - daysAgo * DAY } });
    const deals = [mk("w1", "won", 10), mk("l1", "lost", 20), mk("l2", "lost", 95)];
    const p = closeRateAt(deals, NOW);
    expect(p.den).toBe(2); // the 95-day-old loss is outside the window
    expect(p.rate).toBeCloseTo(0.5);
    // as of 60 days ago, only the 95d loss is in the window
    const past = closeRateAt(deals, NOW - 60 * DAY);
    expect(past.den).toBe(1);
    expect(past.num).toBe(0);
  });
});

describe("conversionTrendRows", () => {
  it("returns 12 monthly rows with all five series and Hi/Meta variants", () => {
    const { series, rows } = conversionTrendRows([deal({ id: "a" })], NOW, true);
    expect(rows).toHaveLength(12);
    expect(series.map((s) => s.key)).toEqual(["sal_sql", "sql_deepdive", "deepdive_pilot", "pilot_won", "close"]);
    const last = rows[rows.length - 1];
    expect(last).toHaveProperty("sal_sql");
    expect(last).toHaveProperty("sal_sqlHi");
    expect(last).toHaveProperty("sal_sqlMeta");
    expect(last).toHaveProperty("close");
  });

  it("skips pilot transitions when pilot is untracked", () => {
    const { series } = conversionTrendRows([deal({ id: "a" })], NOW, false);
    expect(series.map((s) => s.key)).toEqual(["sal_sql", "sql_deepdive", "close"]);
  });

  it("nulls the Hi variant on low-sample months but keeps the base rate", () => {
    const sal = NOW - 10 * DAY;
    const deals = [
      deal({ id: "a", createdAt: sal, entered: { sal, sql: sal + DAY } }),
      deal({ id: "b", createdAt: sal, entered: { sal } }),
    ];
    const { rows } = conversionTrendRows(deals, NOW, true);
    const last = rows[rows.length - 1];
    expect(last.sal_sql).toBe(50); // 1 of 2
    expect(last.sal_sqlHi).toBeNull(); // den 2 < 5 → dimmed
  });
});
