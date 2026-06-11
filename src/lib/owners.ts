import { headlineKpis, headlineWindows } from "./headline";
import { enteredInPeriod } from "./metrics";
import type { Deal } from "./types";

/**
 * Owner-level rollups. Deals carry hubspot_owner_id; names resolve via the
 * owners API when its scope is granted — otherwise "Owner <last 4 of id>".
 * Ownerless deals roll into an "Unassigned" bucket.
 */

export const UNASSIGNED_ID = "__unassigned__";

export interface OwnerInfo {
  id: string;
  name: string;
}

export function ownerDisplayName(deal: Deal): string {
  if (deal.ownerName) return deal.ownerName;
  if (deal.ownerId) return `Owner ${deal.ownerId.slice(-4)}`;
  return "Unassigned";
}

function ownerIdOf(deal: Deal): string {
  return deal.ownerId ?? UNASSIGNED_ID;
}

/** Distinct owners across the book under an attribution, "Unassigned" last. */
export function activeOwners(deals: Deal[], ownerOf?: (deal: Deal) => OwnerInfo): OwnerInfo[] {
  const of = ownerOf ?? hubspotOwnerOf;
  const map = new Map<string, string>();
  for (const d of deals) {
    const o = of(d);
    map.set(o.id, o.name);
  }
  return [...map.entries()]
    .map(([id, name]) => ({ id, name }))
    .sort((a, b) =>
      a.id === UNASSIGNED_ID ? 1 : b.id === UNASSIGNED_ID ? -1 : a.name.localeCompare(b.name)
    );
}

export function dealsForOwner(deals: Deal[], ownerId: string): Deal[] {
  return deals.filter((d) => ownerIdOf(d) === ownerId);
}

/** Attribution selector: HubSpot owner (deal lead) — the default. */
function hubspotOwnerOf(deal: Deal): OwnerInfo {
  return { id: ownerIdOf(deal), name: ownerDisplayName(deal) };
}

/**
 * Attribution selector: sourcing SDR from the manual store (dashboard-native;
 * HubSpot has no field for who sourced a deal). Names are the identity.
 */
export function sdrOwnerOf(dealSdrs: Record<string, string>): (deal: Deal) => OwnerInfo {
  return (deal) => {
    const name = dealSdrs[deal.id];
    return name ? { id: name, name } : { id: UNASSIGNED_ID, name: "Unassigned" };
  };
}

export interface OwnerRow {
  owner: OwnerInfo;
  sals: number;
  sqls: number;
  deepdives: number;
  pilots: number;
  won: number;
  /** Value entering SQL in the period — pipeline $ created. */
  pipeValue: number;
  /** Trailing-12-months win rate; null when nothing closed. */
  winRateT12M: number | null;
  wonLostT12M: { won: number; lost: number };
}

/** Per-owner period volumes + T12M win rate, sorted by pipe $ created desc. */
export function ownerRollup(
  deals: Deal[],
  period: string,
  now: number,
  ownerOf?: (deal: Deal) => OwnerInfo
): OwnerRow[] {
  const of = ownerOf ?? hubspotOwnerOf;
  const t12m = headlineWindows(now, "month"); // always trailing 12 months, per spec
  return activeOwners(deals, of).map((owner) => {
    const mine = deals.filter((d) => of(d).id === owner.id);
    const k = headlineKpis(mine, t12m.cur, t12m.prior);
    return {
      owner,
      sals: enteredInPeriod(mine, "sal", period).count,
      sqls: enteredInPeriod(mine, "sql", period).count,
      deepdives: enteredInPeriod(mine, "deepdive", period).count,
      pilots: enteredInPeriod(mine, "pilot", period).count,
      won: enteredInPeriod(mine, "won", period).count,
      pipeValue: enteredInPeriod(mine, "sql", period).totalValue,
      winRateT12M: k.winRate.rate,
      wonLostT12M: { won: k.winRate.won, lost: k.winRate.lost },
    };
  }).sort((a, b) => b.pipeValue - a.pipeValue);
}
