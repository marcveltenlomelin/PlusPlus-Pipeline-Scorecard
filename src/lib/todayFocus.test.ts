import { describe, expect, it } from "vitest";
import { STAGE_GOALS } from "./config";
import { computeFocusActions, topFocusActions, type FocusInput } from "./todayFocus";
import type { Deal, GoalStage, StageGoal } from "./types";

const DAY = 86_400_000;
/** Fixed clock: June 10, 2026, noon local — matches the period math's timezone. */
const NOW = new Date(2026, 5, 10, 12, 0, 0).getTime();

/** Goals that silence the PACING generator so deal-centric tests stay isolated. */
const ZERO_GOALS: Record<GoalStage, StageGoal> = {
  sal: { month: 0, quarter: 0, year: 0 },
  sql: { month: 0, quarter: 0, year: 0 },
  deepdive: { month: 0, quarter: 0, year: 0 },
  pilot: { month: 0, quarter: 0, year: 0 },
  won: { month: 0, quarter: 0, year: 0 },
};

function deal(over: Partial<Deal> & { id: string }): Deal {
  const createdAt = over.createdAt ?? NOW - 30 * DAY;
  return {
    name: `Deal ${over.id}`,
    amount: 50_000,
    value: 50_000,
    stageId: "stage-x",
    stageLabel: "On Hold",
    isOpen: true,
    entered: { sal: createdAt },
    createdAt,
    hubspotUrl: `https://app.hubspot.com/deal/${over.id}`,
    ...over,
  };
}

function input(deals: Deal[], goals = ZERO_GOALS): FocusInput {
  return { deals, goals, now: NOW, pilotTracked: true };
}

describe("computeFocusActions", () => {
  it("returns an empty array for empty data", () => {
    expect(computeFocusActions(input([]))).toEqual([]);
    expect(computeFocusActions(input([], STAGE_GOALS))).toEqual([]);
  });

  it("surfaces a single stale deal as STALE DEAL", () => {
    const stale = deal({ id: "1", createdAt: NOW - 400 * DAY, entered: { sal: NOW - 400 * DAY } });
    const actions = computeFocusActions(input([stale]));
    expect(actions).toHaveLength(1);
    expect(actions[0].category).toBe("STALE DEAL");
    expect(actions[0].id).toBe("stale:1");
    expect(actions[0].diagnosis).toContain("400 days");
    expect(actions[0].cta.href).toBe(stale.hubspotUrl);
  });

  it("ranks candidates by impact score, one card per category", () => {
    const staleSmall = deal({ id: "s1", value: 30_000, createdAt: NOW - 200 * DAY, entered: { sal: NOW - 200 * DAY } });
    const staleBig = deal({ id: "s2", value: 50_000, createdAt: NOW - 400 * DAY, entered: { sal: NOW - 400 * DAY } });
    const lostBig = deal({
      id: "r1",
      value: 60_000,
      isOpen: false,
      stageLabel: "Closed Lost",
      entered: { sal: NOW - 120 * DAY, lost: NOW - 50 * DAY },
    });
    const actions = computeFocusActions(input([staleSmall, staleBig, lostBig]));
    // one stale card only — the bigger value × days wins within the category
    const staleActions = actions.filter((a) => a.category === "STALE DEAL");
    expect(staleActions).toHaveLength(1);
    expect(staleActions[0].id).toBe("stale:s2");
    // cross-category: stale s2 saturates at 100, revival $60K scores 60
    expect(actions[0].category).toBe("STALE DEAL");
    expect(actions[1].category).toBe("REVIVAL");
    expect(actions[0].score).toBeGreaterThan(actions[1].score);
  });

  it("flags a stage pacing far behind expected mid-month", () => {
    // June 10 with a 31/month SAL goal and zero SALs created → ratio 0
    const old = deal({ id: "p1", createdAt: NOW - 100 * DAY, entered: { sal: NOW - 100 * DAY } });
    const actions = computeFocusActions(input([old], STAGE_GOALS));
    const pacing = actions.find((a) => a.category === "PACING");
    expect(pacing).toBeDefined();
    expect(pacing!.id).toBe("pacing:sal:2026-06");
    expect(pacing!.action).toMatch(/per day/);
  });
});

describe("topFocusActions", () => {
  it("filters dismissed actions and fills the slot with the next candidate", () => {
    // four categories in play: stale, revival, conversion (3 SQLs, 0 converted), pacing
    const stale = deal({ id: "s1", createdAt: NOW - 400 * DAY, entered: { sal: NOW - 400 * DAY } });
    const lost = deal({
      id: "r1",
      value: 60_000,
      isOpen: false,
      stageLabel: "Closed Lost",
      entered: { sal: NOW - 120 * DAY, lost: NOW - 10 * DAY },
    });
    const sqls = [1, 2, 3].map((n) =>
      deal({ id: `c${n}`, createdAt: NOW - 40 * DAY, entered: { sal: NOW - 40 * DAY, sql: NOW - 35 * DAY } })
    );
    const all = input([stale, lost, ...sqls], STAGE_GOALS);

    const ranked = computeFocusActions(all);
    expect(ranked.length).toBeGreaterThanOrEqual(4);

    const top = topFocusActions(all, new Set());
    expect(top).toHaveLength(3);
    expect(top.map((a) => a.id)).toEqual(ranked.slice(0, 3).map((a) => a.id));

    // dismissing the #1 action promotes the #4 candidate into the panel
    const dismissed = topFocusActions(all, new Set([ranked[0].id]));
    expect(dismissed).toHaveLength(3);
    expect(dismissed.map((a) => a.id)).not.toContain(ranked[0].id);
    expect(dismissed.map((a) => a.id)).toContain(ranked[3].id);
  });

  it("never pads — fewer candidates yield fewer cards", () => {
    const stale = deal({ id: "s1", createdAt: NOW - 400 * DAY, entered: { sal: NOW - 400 * DAY } });
    expect(topFocusActions(input([stale]), new Set())).toHaveLength(1);
    expect(topFocusActions(input([stale]), new Set(["stale:s1"]))).toHaveLength(0);
  });
});
