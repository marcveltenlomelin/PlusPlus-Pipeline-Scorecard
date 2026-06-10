"use client";

import { useState } from "react";
import {
  ARR_TARGET,
  AVG_DEAL_SIZE,
  DEFINITIONS,
  NET_NEW_OPP_STAGE,
  PIPELINE_PACE_PER_MONTH,
  STAGE_GOALS,
} from "@/lib/config";
import { daysAgo, fmtDate, fmtMoney, fmtPct } from "@/lib/format";
import { closeRate, enteredInPeriod, openPipeline, valueEnteredBetween } from "@/lib/metrics";
import { periodPhrase } from "@/lib/periods";
import type { Deal, Granularity } from "@/lib/types";
import { useDash, useResolved } from "./ctx";
import { InfoTip, Metric } from "./Metric";

interface RevenueProps {
  deals: Deal[];
  period: string;
  granularity: Granularity;
}

const PERIOD_FACTOR: Record<Granularity, number> = { week: 12 / 52, month: 1, quarter: 3, year: 12 };

function Tile({
  label,
  def,
  children,
  foot,
  bar,
}: {
  label: string;
  def: string;
  children: React.ReactNode;
  foot?: React.ReactNode;
  bar?: { value: number; target: number };
}) {
  return (
    <article className="border border-rule bg-panel p-4 shadow-card">
      <div className="flex items-center justify-between gap-2">
        <h3 className="microlabel">{label}</h3>
        <InfoTip text={def} label={label} />
      </div>
      <p className="mt-2 text-[1.7rem] leading-none font-bold tracking-tight">{children}</p>
      {bar && (
        <div className="mt-3 h-2 bg-paper outline outline-1 outline-rule-dark" role="img"
          aria-label={`${fmtMoney(bar.value, { compact: true })} of ${fmtMoney(bar.target, { compact: true })}`}>
          <div
            className={`h-full ${bar.value >= bar.target ? "bg-good" : "bg-accent"}`}
            style={{ width: `${Math.min(100, (bar.value / bar.target) * 100)}%` }}
          />
        </div>
      )}
      {foot && <p className="mt-2 font-mono text-[11px] leading-relaxed text-ink-faint">{foot}</p>}
    </article>
  );
}

export default function Revenue(p: RevenueProps) {
  const { openDrill, now } = useDash();
  const phrase = periodPhrase(p.period, now);
  const year = new Date(now).getFullYear();
  const yearStart = new Date(year, 0, 1).getTime();
  const monthsElapsed = (now - yearStart) / (365.25 / 12 * 86_400_000);

  const pipePeriod = enteredInPeriod(p.deals, NET_NEW_OPP_STAGE, p.period);
  const pipeYtd = valueEnteredBetween(p.deals, NET_NEW_OPP_STAGE, yearStart, now);
  const wonYtd = valueEnteredBetween(p.deals, "won", yearStart, now);
  const open = openPipeline(p.deals, NET_NEW_OPP_STAGE);
  const cr = closeRate(p.deals, now);
  // the projection honors a manual close-rate override
  const { value: crResolved } = useResolved("closeRate", cr.rate);
  const projected = wonYtd.totalValue + open.totalValue * (crResolved ?? 0);

  const periodTarget = PIPELINE_PACE_PER_MONTH * PERIOD_FACTOR[p.granularity];
  const ytdPaceTarget = PIPELINE_PACE_PER_MONTH * monthsElapsed;

  const money = (n: number) => fmtMoney(n, { compact: true });

  return (
    <section aria-label="Revenue">
      <div className="mb-3 flex items-baseline justify-between gap-3">
        <h2 className="font-display text-base font-bold tracking-tight">
          Revenue <span className="text-ink-faint">— against $1.2M net-new ARR</span>
        </h2>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Tile
          label={`Pipeline created · ${phrase}`}
          def={DEFINITIONS["rev:pipeline"]}
          foot={`target ${money(periodTarget)} at $200K/mo pace · ${pipePeriod.count} opps`}
        >
          <Metric
            id={`rev:pipeline:${p.period}`}
            live={pipePeriod.totalValue}
            format={money}
            onDrill={() =>
              openDrill({
                title: `Pipeline created ${phrase}`,
                subtitle: DEFINITIONS["rev:pipeline"],
                deals: pipePeriod.deals,
                dateOf: (d) => d.entered.sql,
                dateLabel: "Entered SQL",
              })
            }
          />
        </Tile>

        <Tile
          label={`Pipeline created · ${year} YTD`}
          def={DEFINITIONS["rev:pipelineYtd"]}
          bar={{ value: pipeYtd.totalValue, target: ytdPaceTarget }}
          foot={`pace target to date ${money(ytdPaceTarget)}`}
        >
          <Metric
            id={`rev:pipelineYtd:${year}`}
            live={pipeYtd.totalValue}
            format={money}
            onDrill={() =>
              openDrill({
                title: `Pipeline created ${year} YTD`,
                subtitle: DEFINITIONS["rev:pipelineYtd"],
                deals: pipeYtd.deals,
                dateOf: (d) => d.entered.sql,
                dateLabel: "Entered SQL",
              })
            }
          />
        </Tile>

        <Tile
          label={`Closed won · ${year} YTD`}
          def={DEFINITIONS["rev:wonYtd"]}
          bar={{ value: wonYtd.totalValue, target: ARR_TARGET }}
          foot={`${Math.round((wonYtd.totalValue / ARR_TARGET) * 100)}% of ${money(ARR_TARGET)} target · ${wonYtd.count} deals`}
        >
          <Metric
            id={`rev:wonYtd:${year}`}
            live={wonYtd.totalValue}
            format={money}
            onDrill={() =>
              openDrill({
                title: `Closed won ${year} YTD`,
                subtitle: DEFINITIONS["rev:wonYtd"],
                deals: wonYtd.deals,
                dateOf: (d) => d.entered.won,
                dateLabel: "Closed won",
              })
            }
          />
        </Tile>

        <Tile
          label="Projected ARR at close rate"
          def={DEFINITIONS["rev:projArr"]}
          bar={{ value: projected, target: ARR_TARGET }}
          foot={
            <>
              {money(wonYtd.totalValue)} won +{" "}
              <button
                type="button"
                className="underline decoration-rule-dark underline-offset-2 hover:text-accent"
                onClick={() =>
                  openDrill({
                    title: "Open pipeline (entered SQL, still open)",
                    subtitle: DEFINITIONS["rev:openPipeline"],
                    deals: open.deals,
                    dateOf: (d) => d.entered.sql,
                    dateLabel: "Entered SQL",
                  })
                }
              >
                {money(open.totalValue)} open
              </button>{" "}
              × {fmtPct(crResolved)} close
            </>
          }
        >
          <Metric id={`rev:projArr:${year}`} live={projected} format={money} />
        </Tile>
      </div>

      <OpenDealsTable deals={p.deals} now={now} />

      <RevenueMath wonCount={wonYtd.count} year={year} yearStart={yearStart} now={now} />
    </section>
  );
}

/** The bottom line: projected closed-won deals × $50K vs the $1.2M target. */
function RevenueMath({
  wonCount,
  year,
  yearStart,
  now,
}: {
  wonCount: number;
  year: number;
  yearStart: number;
  now: number;
}) {
  const yearEnd = new Date(year + 1, 0, 1).getTime();
  const elapsed = Math.min(1, Math.max(0.0001, (now - yearStart) / (yearEnd - yearStart)));
  const projectedWins = wonCount / elapsed; // straight-line to Dec 31
  const projectedRevenue = projectedWins * AVG_DEAL_SIZE;
  const pct = projectedRevenue / ARR_TARGET;
  const goalWins = STAGE_GOALS.won.year;
  const status =
    pct >= 1
      ? { chip: "bg-good-soft text-good", label: "on track" }
      : pct >= 0.75
        ? { chip: "bg-warn-soft text-warn", label: "stretch" }
        : { chip: "bg-bad-soft text-bad", label: "behind" };

  return (
    <div className="mt-3 border border-rule-dark bg-panel px-5 py-4 shadow-card">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <div className="flex items-center gap-2">
          <h3 className="microlabel">Revenue math · {year}</h3>
          <InfoTip text={DEFINITIONS["rev:math"]} label="Revenue math" />
        </div>
        <span className={`px-2 py-1 text-[10px] font-bold uppercase tracking-wider ${status.chip}`}>
          {status.label}
        </span>
      </div>
      <p className="mt-2 font-mono text-sm leading-relaxed">
        <strong className="text-lg font-bold">{wonCount}</strong> closed-won YTD ÷ {Math.round(elapsed * 100)}% of
        year elapsed → <strong className="text-lg font-bold">{(Math.round(projectedWins * 10) / 10).toLocaleString()}</strong>{" "}
        projected by Dec 31 × {fmtMoney(AVG_DEAL_SIZE, { compact: true })} ={" "}
        <strong className={`text-lg font-bold ${pct >= 1 ? "text-good" : "text-bad"}`}>
          {fmtMoney(projectedRevenue, { compact: true })}
        </strong>{" "}
        <span className="text-ink-faint">
          of {fmtMoney(ARR_TARGET, { compact: true })} target ({Math.round(pct * 100)}%) · goal pace is {goalWins}{" "}
          wins/year
        </span>
      </p>
    </div>
  );
}

function OpenDealsTable({ deals, now }: { deals: Deal[]; now: number }) {
  const [showAll, setShowAll] = useState(false);
  const open = deals.filter((d) => d.isOpen).sort((a, b) => b.value - a.value);
  const visible = showAll ? open : open.slice(0, 12);
  const total = open.reduce((s, d) => s + d.value, 0);

  return (
    <div className="mt-3 border border-rule bg-panel shadow-card">
      <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-rule px-5 py-3">
        <h3 className="font-display text-sm font-bold tracking-tight">
          Open deals <span className="font-normal text-ink-faint">— live from the board, for drill-down</span>
        </h3>
        <p className="font-mono text-[11px] text-ink-faint">
          {open.length} open · {fmtMoney(total, { compact: true })}
        </p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[36rem] text-sm">
          <thead>
            <tr className="border-b border-rule text-left">
              <th className="microlabel px-5 py-2 font-semibold">Deal</th>
              <th className="microlabel px-3 py-2 font-semibold">Stage now</th>
              <th className="microlabel px-3 py-2 text-right font-semibold">Value</th>
              <th className="microlabel px-3 py-2 font-semibold">Created</th>
              <th className="microlabel px-3 py-2 font-semibold">Age</th>
              <th className="px-5 py-2" />
            </tr>
          </thead>
          <tbody>
            {visible.map((d) => (
              <tr key={d.id} className="border-b border-rule/60 last:border-0 hover:bg-paper">
                <td className="max-w-[18rem] truncate px-5 py-2 font-medium">{d.name}</td>
                <td className="whitespace-nowrap px-3 py-2 text-xs text-ink-soft">{d.stageLabel}</td>
                <td className="whitespace-nowrap px-3 py-2 text-right font-mono text-xs">
                  {fmtMoney(d.value, { compact: true })}
                  {d.amount === null && (
                    <span className="ml-1 text-[9px] uppercase text-ink-faint" title="No amount set — $50K default">
                      est
                    </span>
                  )}
                </td>
                <td className="whitespace-nowrap px-3 py-2 font-mono text-xs text-ink-soft">{fmtDate(d.createdAt)}</td>
                <td className="whitespace-nowrap px-3 py-2 font-mono text-xs text-ink-soft">{daysAgo(d.createdAt, now)}</td>
                <td className="whitespace-nowrap px-5 py-2 text-right">
                  <a
                    href={d.hubspotUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="font-mono text-xs text-accent underline decoration-accent/40 underline-offset-2 hover:decoration-accent"
                  >
                    HubSpot ↗
                  </a>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {open.length > 12 && (
        <button
          type="button"
          onClick={() => setShowAll((v) => !v)}
          className="w-full border-t border-rule px-5 py-2.5 text-xs font-semibold text-accent hover:bg-paper"
        >
          {showAll ? "Show top 12" : `Show all ${open.length} open deals`}
        </button>
      )}
    </div>
  );
}
