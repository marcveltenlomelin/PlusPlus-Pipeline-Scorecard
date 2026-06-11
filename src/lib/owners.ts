import type { Deal, StageKey } from "./types";

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
 * Attribution selector: sourcing SDR, read straight off the deal (HubSpot
 * custom property `sourcing_sdr`, written back by this dashboard). Names are
 * the identity.
 */
export function sdrOwnerOf(deal: Deal): OwnerInfo {
  return deal.sdr ? { id: deal.sdr, name: deal.sdr } : { id: UNASSIGNED_ID, name: "Unassigned" };
}

export interface OwnerRow {
  owner: OwnerInfo;
  /** Currently-open deals attributed to this owner — "how many they own" right now. */
  openDeals: number;
  /** Sourced deals that have EVER reached each stage — cumulative attribution. */
  sals: number;
  sqls: number;
  deepdives: number;
  pilots: number;
  won: number;
  /** Total value of sourced deals that ever entered SQL — pipeline $ sourced. */
  pipeValue: number;
  /** All-time win rate over the sourced cohort; null when nothing closed. */
  winRate: number | null;
  wonLost: { won: number; lost: number };
}

/**
 * Per-owner CUMULATIVE funnel: a sourced deal that reached Pilot counts one
 * SQL, one Deep Dive, and one Pilot, whenever those entries happened. The
 * period toggle deliberately does not scope this — crediting an SDR only for
 * stages entered "this month" zeroes their history and reads as broken
 * (confirmed with live data: Motive/Hanna, sourced by Milos, entered
 * SQL/Deep Dive in April and Pilot in May). Sorted by pipe $ sourced desc.
 */
export function ownerRollup(deals: Deal[], ownerOf?: (deal: Deal) => OwnerInfo): OwnerRow[] {
  const of = ownerOf ?? hubspotOwnerOf;
  const reached = (mine: Deal[], stage: StageKey) =>
    mine.filter((d) => d.entered[stage] !== undefined);
  return activeOwners(deals, of)
    .map((owner) => {
      const mine = deals.filter((d) => of(d).id === owner.id);
      const won = reached(mine, "won").length;
      const lost = reached(mine, "lost").length;
      return {
        owner,
        openDeals: mine.filter((d) => d.isOpen).length,
        sals: mine.length, // entered.sal is always set (createdate = SAL signal)
        sqls: reached(mine, "sql").length,
        deepdives: reached(mine, "deepdive").length,
        pilots: reached(mine, "pilot").length,
        won,
        pipeValue: reached(mine, "sql").reduce((s, d) => s + d.value, 0),
        winRate: won + lost ? won / (won + lost) : null,
        wonLost: { won, lost },
      };
    })
    .sort((a, b) => {
      // real people lead; the historical Unassigned bucket sits last regardless of size
      if (a.owner.id === UNASSIGNED_ID) return 1;
      if (b.owner.id === UNASSIGNED_ID) return -1;
      return b.pipeValue - a.pipeValue;
    });
}
