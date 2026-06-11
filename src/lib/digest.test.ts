import { describe, expect, it } from "vitest";
import { STAGE_GOALS } from "./config";
import { buildDigest, shouldSendNow, weekOfLabel } from "./digest";
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
    expect(d.subject).toMatch(/^PlusPlus Pipeline · Week of Jun 8, 2026 · /);
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

  it("counts this week's funnel entries with weekly goals", () => {
    const d = buildDigest([deal({ id: "thisweek" })], STAGE_GOALS, NOW, "full", true);
    const sal = d.funnel.find((f) => f.stage === "SAL")!;
    expect(sal.count).toBe(1);
    expect(sal.goal).toBeCloseTo((31 * 12) / 52, 0);
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
  it("anchors to Monday of the current ISO week", () => {
    expect(weekOfLabel(NOW)).toBe("Jun 8, 2026");
  });
});
