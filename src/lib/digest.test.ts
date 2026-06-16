import { describe, expect, it } from "vitest";
import { STAGE_GOALS } from "./config";
import { buildDigest, isDigestDay, shouldSendNow, weekOfLabel } from "./digest";
import type { Deal } from "./types";

const DAY = 86_400_000;
const NOW = new Date(2026, 5, 10, 12).getTime(); // Wed June 10, 2026

function deal(over: Partial<Deal> & { id: string }): Deal {
  const createdAt = over.createdAt ?? NOW - 2 * DAY;
  return {
    name: `Acme Corp ${over.id}`,
    amount: 50_000,
    value: 50_000,
    stageId: "x",
    stageLabel: "SAL (Discovery Booked)",
    isOpen: true,
    entered: { sal: createdAt },
    createdAt,
    hubspotUrl: `https://example.com/${over.id}`,
    ...over,
  };
}

const staleDeal = deal({
  id: "stale1",
  name: "SecretCo Deal",
  createdAt: NOW - 200 * DAY,
  entered: { sal: NOW - 200 * DAY },
});

describe("buildDigest", () => {
  it("builds a subject with the week label and a stale-led headline", () => {
    const d = buildDigest([staleDeal, deal({ id: "a" })], STAGE_GOALS, NOW, "full", true);
    expect(d.subject).toMatch(/^PlusPlus Pipeline · Week of Jun 1, 2026 · /);
    expect(d.subject).toContain("1 stale deal needs attention");
  });

  it("includes deal names in the full variant", () => {
    const d = buildDigest([staleDeal], STAGE_GOALS, NOW, "full", true);
    expect(d.stale.rows[0].name).toBe("SecretCo Deal");
    expect(JSON.stringify(d.focus)).toContain("SecretCo Deal");
  });

  it("redacts every deal name in the aggregate variant", () => {
    const d = buildDigest([staleDeal, deal({ id: "b" })], STAGE_GOALS, NOW, "aggregate", true);
    const all = JSON.stringify(d);
    expect(all).not.toContain("SecretCo Deal");
    expect(all).not.toContain("Acme Corp b");
    expect(d.stale.rows[0].name).toBe("(deal name hidden)");
    expect(d.stale.count).toBe(1); // aggregates survive
  });

  it("counts LAST week's funnel entries (not the in-progress week) with weekly goals", () => {
    // NOW = Wed Jun 10 → last week is Jun 1–7; a deal 7 days ago lands there.
    const lastWeek = deal({ id: "lastweek", createdAt: NOW - 7 * DAY, entered: { sal: NOW - 7 * DAY } });
    const thisWeek = deal({ id: "thisweek", createdAt: NOW - 1 * DAY, entered: { sal: NOW - 1 * DAY } });
    const d = buildDigest([lastWeek, thisWeek], STAGE_GOALS, NOW, "full", true);
    const sal = d.funnel.find((f) => f.stage === "SAL")!;
    expect(sal.count).toBe(1); // only the prior-week deal counts
    expect(sal.goal).toBeCloseTo((31 * 12) / 52, 0);
  });
});

describe("buildDigest — By SDR weekly block", () => {
  it("credits LAST week's entries per SDR, shows roster zeros, buckets unassigned", () => {
    const milosDeal = deal({
      id: "m1",
      sdr: "Milos",
      createdAt: NOW - 7 * DAY, // last week (Jun 1–7) — the reported window
      entered: { sal: NOW - 7 * DAY, sql: NOW - 7 * DAY },
    });
    const thisWeekMilos = deal({
      id: "m3",
      sdr: "Milos",
      createdAt: NOW - 1 * DAY, // in-progress week — must NOT count
      entered: { sal: NOW - 1 * DAY, sql: NOW - 1 * DAY },
    });
    const oldMilosDeal = deal({
      id: "m2",
      sdr: "Milos",
      createdAt: NOW - 30 * DAY, // last month — not last week's numbers
      entered: { sal: NOW - 30 * DAY },
    });
    const unattributed = deal({ id: "u1", createdAt: NOW - 7 * DAY, entered: { sal: NOW - 7 * DAY } });
    const d = buildDigest(
      [milosDeal, thisWeekMilos, oldMilosDeal, unattributed],
      STAGE_GOALS,
      NOW,
      "full",
      true,
      ["Milos", "Daniela"]
    );
    const milos = d.sdrs.find((s) => s.name === "Milos")!;
    expect(milos.sals).toBe(1); // last week only — this-week + last-month excluded
    expect(milos.sqls).toBe(1);
    expect(milos.pipe).toBe("$50K");
    const daniela = d.sdrs.find((s) => s.name === "Daniela")!;
    expect(daniela.sals).toBe(0); // roster name shows even with a zero week
    const un = d.sdrs.find((s) => s.name === "Unassigned")!;
    expect(un.sals).toBe(1);
  });
});

describe("shouldSendNow", () => {
  it("always sends when never sent", () => {
    expect(shouldSendNow("weekly", undefined, NOW)).toBe(true);
  });
  it("respects cadence windows with jitter tolerance", () => {
    expect(shouldSendNow("weekly", NOW - 7 * DAY, NOW)).toBe(true);
    expect(shouldSendNow("weekly", NOW - 3 * DAY, NOW)).toBe(false);
    expect(shouldSendNow("biweekly", NOW - 7 * DAY, NOW)).toBe(false);
    expect(shouldSendNow("biweekly", NOW - 14 * DAY, NOW)).toBe(true);
    expect(shouldSendNow("monthly", NOW - 14 * DAY, NOW)).toBe(false);
    expect(shouldSendNow("monthly", NOW - 28 * DAY, NOW)).toBe(true);
  });
});

describe("weekOfLabel", () => {
  it("anchors to Monday of the PRIOR week (the reported window)", () => {
    // NOW = Wed Jun 10, 2026; current week starts Mon Jun 8 → prior week starts Jun 1
    expect(weekOfLabel(NOW)).toBe("Jun 1, 2026");
  });
});

describe("isDigestDay", () => {
  it("is true only on Tuesday (UTC)", () => {
    expect(isDigestDay(Date.UTC(2026, 5, 16, 15))).toBe(true); // Tue Jun 16
    expect(isDigestDay(Date.UTC(2026, 5, 15, 15))).toBe(false); // Mon
    expect(isDigestDay(Date.UTC(2026, 5, 17, 15))).toBe(false); // Wed
  });
});
