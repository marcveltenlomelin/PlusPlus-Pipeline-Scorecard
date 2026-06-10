"use client";

import { useEffect, useRef, useState } from "react";
import { fmtDateTime } from "@/lib/format";
import { isCurrentPeriod, periodKey, periodLabel, shiftPeriod } from "@/lib/periods";
import type { DealsPayload, Granularity } from "@/lib/types";

/** One place that explains every marker on the page. */
function HowToRead() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const items: [React.ReactNode, string][] = [
    [
      <span key="t" className="font-mono underline decoration-rule-dark decoration-2 underline-offset-4">12</span>,
      "Every count is deals that ENTERED a stage in the period — not where deals sit now, so it won't match the HubSpot board. Click any underlined number to see the exact deals behind it.",
    ],
    [
      <span key="g" className="text-ink-faint">of 6</span>,
      "Actual vs goal. Goals come from the model: $1.2M ARR ÷ $50K = 24 wins/year, worked backwards up the funnel. Click a goal to edit it; ↺ resets to the model.",
    ],
    [
      <span key="r" className="bg-bad-soft px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-bad">at risk</span>,
      "Below 75% of where the goal says you should be by today. Click the chip for the math.",
    ],
    [
      <span key="m" className="bg-manual-soft px-1 py-px text-[9px] font-bold uppercase tracking-wider text-manual">manual</span>,
      "A value someone overrode by hand (hover any number and click ✎). ↺ reverts to live data.",
    ],
    [
      <span key="e" className="text-[9px] uppercase text-ink-faint">est</span>,
      "Deal has no amount in HubSpot — counted at the $50K default.",
    ],
    [
      <span key="i" className="grid size-4 place-items-center rounded-full border border-rule-dark text-[9px] font-bold text-ink-soft">i</span>,
      "The exact definition of that number — source property, window, method.",
    ],
  ];

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
        className="border border-rule-dark px-3 py-2 text-xs font-bold uppercase tracking-wider text-ink-soft transition-colors hover:border-accent hover:text-accent"
      >
        How to read
      </button>
      {open && (
        <div className="absolute right-0 top-full z-40 mt-2 w-[22rem] max-w-[90vw] border border-rule-dark bg-panel p-4 shadow-pop">
          <h2 className="font-display text-sm font-bold tracking-tight">How to read this dashboard</h2>
          <dl className="mt-3 space-y-3">
            {items.map(([badge, text], i) => (
              <div key={i} className="grid grid-cols-[3.5rem_1fr] gap-2">
                <dt className="pt-0.5 text-right">{badge}</dt>
                <dd className="text-xs leading-relaxed text-ink-soft">{text}</dd>
              </div>
            ))}
          </dl>
        </div>
      )}
    </div>
  );
}

const GRANULARITIES: { value: Granularity; label: string }[] = [
  { value: "week", label: "Week" },
  { value: "month", label: "Month" },
  { value: "quarter", label: "Quarter" },
  { value: "year", label: "Year" },
];

interface HeaderProps {
  granularity: Granularity;
  period: string;
  now: number;
  payload: DealsPayload | null;
  refreshing: boolean;
  onGranularity: (g: Granularity) => void;
  onPeriod: (key: string) => void;
  onRefresh: () => void;
}

export default function Header(p: HeaderProps) {
  const current = isCurrentPeriod(p.period, p.now);
  return (
    <header className="border-b-2 border-ink">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-end gap-x-5 gap-y-3 px-5 py-4 sm:px-8">
        <div className="mr-auto flex items-center gap-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/plusplus-logo.png" alt="PlusPlus" className="size-10 shrink-0" />
          <div>
            <p className="font-display text-xl font-extrabold tracking-tight">Pipeline Scoreboard</p>
            <p className="mt-0.5 text-[11px] text-ink-faint">
              New Accounts · stage entries per period, not board occupancy
            </p>
          </div>
        </div>

        {/* granularity */}
        <div role="group" aria-label="Period granularity" className="flex border border-ink">
          {GRANULARITIES.map((g) => (
            <button
              key={g.value}
              type="button"
              aria-pressed={p.granularity === g.value}
              onClick={() => p.onGranularity(g.value)}
              className={`px-3 py-1.5 text-xs font-semibold uppercase tracking-wider transition-colors ${
                p.granularity === g.value ? "bg-ink text-paper" : "text-ink-soft hover:bg-paper"
              }`}
            >
              {g.label}
            </button>
          ))}
        </div>

        {/* period navigation */}
        <div className="flex items-center gap-1">
          <button
            type="button"
            aria-label="Previous period"
            onClick={() => p.onPeriod(shiftPeriod(p.period, -1))}
            className="grid size-8 place-items-center border border-rule-dark hover:border-accent hover:text-accent"
          >
            ‹
          </button>
          <span className="min-w-[7.5rem] text-center font-mono text-sm font-semibold">
            {periodLabel(p.period)}
          </span>
          <button
            type="button"
            aria-label="Next period"
            disabled={current}
            onClick={() => p.onPeriod(shiftPeriod(p.period, 1))}
            className="grid size-8 place-items-center border border-rule-dark hover:border-accent hover:text-accent disabled:cursor-not-allowed disabled:opacity-30 disabled:hover:border-rule-dark disabled:hover:text-inherit"
          >
            ›
          </button>
          {!current && (
            <button
              type="button"
              onClick={() => p.onPeriod(periodKey(p.now, p.granularity))}
              className="ml-1 px-2 py-1.5 text-xs font-semibold text-accent underline underline-offset-2"
            >
              Today
            </button>
          )}
        </div>

        {/* sync */}
        <div className="flex items-center gap-2.5">
          <span className="text-right text-[11px] leading-tight text-ink-faint">
            {p.payload ? (
              <>
                {p.payload.source === "demo" ? "demo data" : `synced ${fmtDateTime(p.payload.fetchedAt)}`}
                <br />
                <span className={p.payload.source === "live" ? "text-good" : p.payload.source === "cache" ? "text-warn" : ""}>
                  {p.payload.source === "live" ? "● live" : p.payload.source === "cache" ? "● cached" : "● sample"}
                </span>
              </>
            ) : (
              "syncing…"
            )}
          </span>
          <button
            type="button"
            onClick={p.onRefresh}
            disabled={p.refreshing}
            className="border border-ink bg-ink px-3 py-2 text-xs font-bold uppercase tracking-wider text-paper transition-colors hover:bg-accent hover:border-accent disabled:opacity-50"
          >
            {p.refreshing ? "Syncing…" : "Refresh"}
          </button>
          <HowToRead />
        </div>
      </div>
    </header>
  );
}
