"use client";

import { useMemo } from "react";
import { fmtMoney } from "@/lib/format";
import { staleDeals } from "@/lib/stale";
import type { Deal } from "@/lib/types";
import { useDash } from "./ctx";

/**
 * The needs-attention list: every stale deal (past its stage threshold) plus
 * On Hold deals parked >180 days, worst value × days first. Action chips open
 * the HubSpot record — HubSpot has no URL that performs a close, so the chip
 * label carries the intent and the record is where the action happens.
 */
export default function StaleDeals({ deals }: { deals: Deal[] }) {
  const { now } = useDash();
  const entries = useMemo(() => staleDeals(deals, now), [deals, now]);

  if (entries.length === 0) {
    return (
      <div className="border border-rule bg-panel px-5 py-6 shadow-card">
        <p className="text-sm text-ink-faint">No stale deals — nice.</p>
      </div>
    );
  }

  return (
    <div className="border border-rule bg-panel shadow-card">
      {entries.map(({ deal, staleness }, i) => (
        <div
          key={deal.id}
          className={`flex flex-wrap items-center gap-x-4 gap-y-2 px-5 py-3 hover:bg-paper ${
            i > 0 ? "border-t border-rule/60" : ""
          }`}
        >
          <p className="w-full min-w-0 truncate text-sm font-medium sm:w-auto sm:flex-1">{deal.name}</p>
          <span className="whitespace-nowrap text-xs text-ink-soft">{deal.stageLabel}</span>
          <span
            className="whitespace-nowrap font-mono text-xs text-bad"
            title={
              staleness.threshold !== null
                ? `stale past ${staleness.threshold} days in stage`
                : "On Hold — needs attention past 180 days"
            }
          >
            {staleness.daysInStage}d in stage
          </span>
          <span className="whitespace-nowrap font-mono text-xs">{fmtMoney(deal.value, { compact: true })}</span>
          <span className="flex items-center gap-1.5">
            <a
              href={deal.hubspotUrl}
              target="_blank"
              rel="noreferrer"
              title="Open the deal in HubSpot to close-lost it"
              className="bg-bad-soft px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-bad hover:bg-bad hover:text-white"
            >
              Close-lost
            </a>
            <a
              href={deal.hubspotUrl}
              target="_blank"
              rel="noreferrer"
              title="Open the deal in HubSpot to schedule a revival touch"
              className="bg-accent-soft px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-accent hover:bg-accent hover:text-white"
            >
              Revive
            </a>
          </span>
        </div>
      ))}
    </div>
  );
}
