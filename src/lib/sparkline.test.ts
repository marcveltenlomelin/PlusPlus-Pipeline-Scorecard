import { describe, expect, it } from "vitest";
import { stageSparkline } from "./sparkline";
import type { Deal } from "./types";

const DAY = 86_400_000;
const NOW = new Date(2026, 5, 10, 12).getTime(); // June 10, 2026

/** A deal whose SAL entry (creation) lands `monthsAgo` calendar months back. */
function salAt(id: string, monthsAgo: number): Deal {
  const d = new Date(2026, 5 - monthsAgo, 15).getTime();
  return {
    id,
    name: `Deal ${id}`,
    amount: 50_000,
    value: 50_000,
    stageId: "x",
    stageLabel: "SAL",
    isOpen: true,
    entered: { sal: d },
    createdAt: d,
    hubspotUrl: `https://example.com/${id}`,
  };
}

describe("stageSparkline", () => {
  it("returns 13 monthly points with a YoY percent", () => {
    // 2 in June '25 (13 months window start), 1 in June '26
    const deals = [salAt("a", 12), salAt("b", 12), salAt("c", 0)];
    const s = stageSparkline(deals, "sal", NOW);
    expect(s.points).toHaveLength(13);
    expect(s.points[0].label).toMatch(/Jun .?25/);
    expect(s.points[0].count).toBe(2);
    expect(s.points[12].count).toBe(1);
    expect(s.yoy).not.toBeNull();
    expect(s.yoy!.prior).toBe(2);
    expect(s.yoy!.pct).toBeCloseTo(-0.5); // 1 vs 2 = −50%
    expect(s.since).toBeNull();
  });

  it("yields a null pct when the prior month had zero entries", () => {
    // history predates the window (no clipping), but June '25 itself is empty
    const deals = [salAt("a", 20), salAt("b", 0)];
    const s = stageSparkline(deals, "sal", NOW);
    expect(s.yoy!.prior).toBe(0);
    expect(s.yoy!.pct).toBeNull();
  });

  it("clips to the first entry month and reports a Since label", () => {
    // history starts 4 months ago — window clips to 5 points (Feb..Jun)
    const deals = [salAt("a", 4), salAt("b", 1)];
    const s = stageSparkline(deals, "sal", NOW);
    expect(s.points).toHaveLength(5);
    expect(s.yoy).toBeNull();
    expect(s.since).toMatch(/Feb .?26/);
  });

  it("does not clip when history predates the window", () => {
    const deals = [salAt("a", 20), salAt("b", 0)]; // 20 months ago = before the window
    const s = stageSparkline(deals, "sal", NOW);
    expect(s.points).toHaveLength(13);
    expect(s.yoy).not.toBeNull();
  });

  it("handles a stage with no entries at all", () => {
    const deals = [salAt("a", 2)];
    const s = stageSparkline(deals, "won", NOW);
    expect(s.points).toHaveLength(13);
    expect(s.points.every((p) => p.count === 0)).toBe(true);
    expect(s.yoy!.pct).toBeNull(); // prior 0
  });
});
