import { DEFAULT_DEAL_VALUE, dealUrl } from "./config";
import type { Deal, StageKey } from "./types";

/**
 * Demo mode: deterministic, realistic-looking sample data used when
 * HUBSPOT_TOKEN is missing so the dashboard can be previewed end-to-end.
 * Mirrors the real pipeline's shape, including the gaps: no first_pilot_date
 * (so Pilot falls back to occupancy) and some deals without an amount.
 */

const STAGES = [
  { id: "sal_stage", label: "SAL", isClosed: false },
  { id: "appointmentscheduled", label: "SQL", isClosed: false },
  { id: "presentationscheduled", label: "Deep Dive Demo", isClosed: false },
  { id: "pilot_review", label: "Pilot (Review)", isClosed: false },
  { id: "closedwon", label: "Closed Won", isClosed: true },
  { id: "closedlost", label: "Closed Lost", isClosed: true },
] as const;

function mulberry32(seed: number) {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Demo owners so the By Owner table renders multi-row without a live portal. */
const OWNERS = [
  { id: "demo-1", name: "Alex Rivera" },
  { id: "demo-2", name: "Sam Chen" },
  { id: "demo-3", name: "Jordan Blake" },
];

const COMPANIES = [
  "Acme Robotics", "Northwind Labs", "Hooli Cloud", "Vandelay Systems", "Initech",
  "Globex Learning", "Stark Industries", "Wayne Tech", "Umbrella Health", "Pied Piper",
  "Aviato", "Dunder Mifflin", "Cyberdyne AI", "Tyrell Corp", "Wonka Platforms",
  "Soylent Data", "Massive Dynamic", "Oscorp Bio", "Gringotts Fintech", "Monsters U",
  "Prestige Worldwide", "Bluth Co", "Sterling Cooper", "Genco Olive", "Oceanic Air",
];

const DAY = 86_400_000;

export function demoDeals(): { deals: Deal[]; pilotStageId: string } {
  const rand = mulberry32(31091);
  const now = Date.now();
  const start = now - 480 * DAY; // ~16 months of history
  const deals: Deal[] = [];
  let id = 9_000_001;

  for (let t = start; t < now; ) {
    // ~30 deals created per month → one every ~24h with jitter
    t += (12 + rand() * 24) * 3_600_000;
    if (t >= now) break;

    const created = Math.round(t);
    const entered: Partial<Record<StageKey, number>> = { sal: created };
    let furthest: (typeof STAGES)[number]["id"] = "sal_stage";

    const advance = (p: number, lagMin: number, lagMax: number, from: number): number | null => {
      if (rand() > p) return null;
      const when = from + (lagMin + rand() * (lagMax - lagMin)) * DAY;
      return when < now ? Math.round(when) : null; // future events haven't happened yet
    };

    const sql = advance(0.38, 3, 21, created);
    if (sql) {
      entered.sql = sql;
      furthest = "appointmentscheduled";
      const dd = advance(0.55, 5, 25, sql);
      if (dd) {
        entered.deepdive = dd;
        furthest = "presentationscheduled";
        // some Deep Dives move into Pilot (occupancy only — no first_pilot_date,
        // exactly like the real portal before the workflow exists)
        const pilotMoved = rand() < 0.45 ? advance(1, 7, 30, dd) : null;
        if (pilotMoved) furthest = "pilot_review";
        const closeFrom = pilotMoved ?? dd;
        const closed = advance(0.6, 14, 60, closeFrom);
        if (closed) {
          if (rand() < 0.48) entered.won = closed;
          else entered.lost = closed;
          furthest = entered.won ? "closedwon" : "closedlost";
        }
      } else {
        // SQLs that stall sometimes get disqualified
        const lost = advance(0.35, 10, 45, sql);
        if (lost) {
          entered.lost = lost;
          furthest = "closedlost";
        }
      }
    } else {
      // SALs that never convert mostly get closed out
      const lost = advance(0.5, 7, 40, created);
      if (lost) {
        entered.lost = lost;
        furthest = "closedlost";
      }
    }

    const stage = STAGES.find((s) => s.id === furthest)!;
    const hasAmount = rand() < 0.6;
    const amount = hasAmount ? Math.round((20 + rand() * 100) / 5) * 5000 : null;
    const dealId = String(id++);
    const owner = OWNERS[Math.floor(rand() * OWNERS.length)];
    // ~60% of demo deals carry sourcing attribution, like a real half-adopted rollout
    const sdr = rand() < 0.6 ? OWNERS[Math.floor(rand() * OWNERS.length)].name : undefined;
    deals.push({
      id: dealId,
      name: `${COMPANIES[Math.floor(rand() * COMPANIES.length)]} — Platform`,
      ownerId: owner.id,
      ownerName: owner.name,
      sdr,
      amount,
      value: amount ?? DEFAULT_DEAL_VALUE,
      stageId: stage.id,
      stageLabel: stage.label,
      isOpen: !stage.isClosed,
      entered,
      createdAt: created,
      hubspotUrl: dealUrl(dealId),
    });
  }

  return { deals, pilotStageId: "pilot_review" };
}
