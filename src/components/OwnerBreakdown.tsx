"use client";

import { useMemo } from "react";
import { fmtMoney, fmtNum, fmtPct } from "@/lib/format";
import { ownerRollup, UNASSIGNED_ID, type OwnerInfo, type OwnerRow } from "@/lib/owners";
import type { Deal } from "@/lib/types";
import { useDash } from "./ctx";

/**
 * Colored-initials avatar. The HubSpot owners API exposes no user photo URL,
 * so initials are the real rendering; the img branch is wired for a future
 * photo source.
 */
export function Avatar({ name, photoUrl }: { name: string; photoUrl?: string }) {
  if (photoUrl) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={photoUrl} alt="" className="size-6 shrink-0 rounded-full object-cover" />;
  }
  const PALETTE = [
    "bg-accent-soft text-accent",
    "bg-good-soft text-good",
    "bg-ahead-soft text-ahead",
    "bg-warn-soft text-warn",
  ];
  const hash = [...name].reduce((h, c) => (h * 31 + c.charCodeAt(0)) | 0, 7);
  const cls = PALETTE[Math.abs(hash) % PALETTE.length];
  const initials = name
    .split(/\s+/)
    .map((w) => w[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();
  return (
    <span
      aria-hidden
      className={`grid size-6 shrink-0 place-items-center rounded-full text-[10px] font-bold ${cls}`}
    >
      {initials}
    </span>
  );
}

interface OwnerBreakdownProps {
  deals: Deal[];
  period: string;
  /** Attribution selector — defaults to HubSpot owner; pass sdrOwnerOf(...) for sourcing. */
  ownerOf?: (deal: Deal) => OwnerInfo;
  /** Currently filtered owner (highlight + toggle target). */
  selectedOwner: string | null;
  onSelectOwner: (id: string | null) => void;
}

const NUM_COLS: {
  key: keyof Pick<OwnerRow, "openDeals" | "sals" | "sqls" | "deepdives" | "pilots" | "won">;
  label: string;
}[] = [
  { key: "openDeals", label: "Open deals" },
  { key: "sals", label: "SALs" },
  { key: "sqls", label: "SQLs" },
  { key: "deepdives", label: "Deep Dives" },
  { key: "pilots", label: "Pilots" },
  { key: "won", label: "Won" },
];

function winRateCell(row: OwnerRow): string {
  if (row.winRateT12M === null) return "—";
  return `${fmtPct(row.winRateT12M)} (${row.wonLostT12M.won}–${row.wonLostT12M.lost})`;
}

/** Per-rep period volumes + T12M win rate. Single-owner books get a leaderboard card. */
export default function OwnerBreakdown(p: OwnerBreakdownProps) {
  const { now } = useDash();
  const rows = useMemo(
    () => ownerRollup(p.deals, p.period, now, p.ownerOf),
    [p.deals, p.period, now, p.ownerOf]
  );

  // Solo book: one card with tiles instead of a one-row table.
  if (rows.length === 1) {
    const r = rows[0];
    return (
      <div className="border border-rule bg-panel p-5 shadow-card">
        <div className="flex items-center gap-2.5">
          <Avatar name={r.owner.name} />
          <h3 className="text-base font-bold tracking-tight">{r.owner.name}</h3>
        </div>
        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-7">
          {NUM_COLS.map((c) => (
            <div key={c.key}>
              <p className="microlabel">{c.label}</p>
              <p className="mt-1 font-mono text-2xl font-bold">{fmtNum(r[c.key])}</p>
            </div>
          ))}
          <div>
            <p className="microlabel">Pipe $ created</p>
            <p className="mt-1 font-mono text-2xl font-bold">{fmtMoney(r.pipeValue, { compact: true })}</p>
          </div>
          <div>
            <p className="microlabel">Win rate (T12M)</p>
            <p className="mt-1 font-mono text-2xl font-bold">{winRateCell(r)}</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto border border-rule bg-panel shadow-card">
      <table className="w-full min-w-[48rem] text-sm">
        <thead>
          <tr className="border-b border-rule text-left">
            <th className="microlabel px-5 py-2.5 font-semibold">Owner</th>
            {NUM_COLS.map((c) => (
              <th key={c.key} className="microlabel px-3 py-2.5 text-right font-semibold">
                {c.label}
              </th>
            ))}
            <th className="microlabel px-3 py-2.5 text-right font-semibold">Pipe $ created</th>
            <th className="microlabel px-5 py-2.5 text-right font-semibold">Win rate (T12M)</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const selected = p.selectedOwner === r.owner.id;
            return (
              <tr
                key={r.owner.id}
                className={`border-b border-rule/60 last:border-0 hover:bg-paper ${selected ? "bg-accent-soft/60" : ""}`}
              >
                <td className="whitespace-nowrap px-5 py-2.5">
                  <button
                    type="button"
                    onClick={() => p.onSelectOwner(selected ? null : r.owner.id)}
                    title={selected ? "Clear the owner filter" : `Filter every section to ${r.owner.name}`}
                    className="inline-flex items-center gap-2 font-medium underline decoration-rule-dark underline-offset-4 hover:text-accent hover:decoration-accent"
                  >
                    <Avatar name={r.owner.name} />
                    {r.owner.name}
                    {r.owner.id === UNASSIGNED_ID && (
                      <span className="text-[9px] uppercase text-ink-faint">not attributed</span>
                    )}
                  </button>
                </td>
                {NUM_COLS.map((c) => (
                  <td key={c.key} className="whitespace-nowrap px-3 py-2.5 text-right font-mono text-xs">
                    {fmtNum(r[c.key])}
                  </td>
                ))}
                <td className="whitespace-nowrap px-3 py-2.5 text-right font-mono text-xs">
                  {fmtMoney(r.pipeValue, { compact: true })}
                </td>
                <td className="whitespace-nowrap px-5 py-2.5 text-right font-mono text-xs">{winRateCell(r)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
