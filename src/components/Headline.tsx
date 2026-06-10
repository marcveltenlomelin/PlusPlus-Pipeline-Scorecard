"use client";

import { useMemo } from "react";
import { fmtDate, fmtMoney, fmtNum, fmtPct } from "@/lib/format";
import { headlineKpis, headlineWindows, type KpiWindow } from "@/lib/headline";
import type { Deal, Granularity } from "@/lib/types";
import { useDash } from "./ctx";
import { InfoTip } from "./Metric";

interface HeadlineProps {
  deals: Deal[];
  granularity: Granularity;
}

function rangeText(w: KpiWindow): string {
  return `${fmtDate(w.start)} – ${fmtDate(w.end)}`;
}

/** ↑/↓ delta line. `goodWhen` flips which direction reads green. */
function Delta({
  delta,
  format,
  goodWhen,
}: {
  delta: number | null;
  format: (n: number) => string;
  goodWhen: "up" | "down";
}) {
  if (delta === null) return <span title="No closes in the prior window">— vs prior</span>;
  if (Math.abs(delta) < 1e-9) return <span>— vs prior</span>;
  const up = delta > 0;
  const good = goodWhen === "up" ? up : !up;
  return (
    <span className={good ? "text-good" : "text-bad"} title="vs the prior window">
      {up ? "↑" : "↓"} {format(Math.abs(delta))} vs prior
    </span>
  );
}

function Tile({
  label,
  def,
  value,
  foot,
}: {
  label: string;
  def: string;
  value: React.ReactNode;
  foot: React.ReactNode;
}) {
  return (
    <article className="border border-rule bg-panel p-4 shadow-card">
      <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1">
        <h3 className="microlabel">{label}</h3>
        <InfoTip text={def} label={label} />
      </div>
      <p className="mt-2 whitespace-nowrap text-4xl font-bold tracking-tight">{value}</p>
      <p className="mt-1.5 flex flex-wrap items-center gap-x-2 font-mono text-[11px] text-ink-faint">{foot}</p>
    </article>
  );
}

/** The three numbers an operator quotes first, over a long window. */
export default function Headline(p: HeadlineProps) {
  const { now } = useDash();
  const windows = useMemo(() => headlineWindows(now, p.granularity), [now, p.granularity]);
  const k = useMemo(() => headlineKpis(p.deals, windows.cur, windows.prior), [p.deals, windows]);
  const range = rangeText(windows.cur);

  const days = (n: number) => `${Math.round(n)} ${Math.round(n) === 1 ? "day" : "days"}`;

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
      <Tile
        label="Win rate"
        def={`Closed Won ÷ (Closed Won + Closed Lost) among deals that closed between ${range}. Delta compares the equivalent prior window.`}
        value={k.winRate.rate === null ? <span className="text-ink-faint">—</span> : fmtPct(k.winRate.rate)}
        foot={
          <>
            <span>
              {fmtNum(k.winRate.won)} won · {fmtNum(k.winRate.lost)} lost
            </span>
            <Delta
              delta={
                k.winRate.rate !== null && k.winRate.priorRate !== null
                  ? (k.winRate.rate - k.winRate.priorRate) * 100
                  : null
              }
              format={(n) => `${Math.round(n)}pts`}
              goodWhen="up"
            />
          </>
        }
      />

      <Tile
        label="Avg sales cycle"
        def={`Median days from deal creation (the SAL signal) to Closed Won, for deals won between ${range}. The range below is P25–P75. Delta compares the prior window's median — shorter is better.`}
        value={
          k.cycle.median === null ? (
            <span className="text-ink-faint">N/A</span>
          ) : (
            <>
              {fmtNum(Math.round(k.cycle.median))}
              <span className="ml-1 text-base font-semibold text-ink-faint">days</span>
            </>
          )
        }
        foot={
          k.cycle.median === null ? (
            <span>needs a first closed-won to measure</span>
          ) : (
            <>
              <span>
                P25–P75: {Math.round(k.cycle.p25!)}–{Math.round(k.cycle.p75!)} days
              </span>
              <Delta
                delta={k.cycle.priorMedian !== null ? k.cycle.median - k.cycle.priorMedian : null}
                format={days}
                goodWhen="down"
              />
            </>
          )
        }
      />

      <Tile
        label="Avg deal size"
        def={`Mean closed-won deal value (HubSpot amount; $50K default when unset) for deals won between ${range}. Median shown below. Delta compares the prior window's mean.`}
        value={
          k.dealSize.mean === null ? (
            <span className="text-ink-faint">—</span>
          ) : (
            fmtMoney(k.dealSize.mean, { compact: true })
          )
        }
        foot={
          k.dealSize.mean === null ? (
            <span>no closed-won deals in this window</span>
          ) : (
            <>
              <span>median {fmtMoney(k.dealSize.median!, { compact: true })}</span>
              <Delta
                delta={k.dealSize.priorMean !== null ? k.dealSize.mean - k.dealSize.priorMean : null}
                format={(n) => fmtMoney(n, { compact: true })}
                goodWhen="up"
              />
            </>
          )
        }
      />
    </div>
  );
}
