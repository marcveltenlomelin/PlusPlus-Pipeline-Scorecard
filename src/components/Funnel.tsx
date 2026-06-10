"use client";

import { CLOSE_RATE_TARGET, CONVERSION_TARGETS, DEFINITIONS, TRAILING_WINDOW_DAYS } from "@/lib/config";
import { fmtNum, fmtPct } from "@/lib/format";
import { closeRate, conversion } from "@/lib/metrics";
import type { Deal, StageKey } from "@/lib/types";
import { useDash, useResolved } from "./ctx";
import { EMPTY_TRACK, InfoTip, Metric } from "./Metric";

const MS_DAY = 86_400_000;

interface FunnelProps {
  deals: Deal[];
  pilotTracked: boolean;
}

const LABELS: Partial<Record<StageKey, string>> = {
  sal: "SAL",
  sql: "SQL",
  deepdive: "Deep Dive",
  pilot: "Pilot",
  won: "Won",
};

/** Funnel steps with their target rates from the goal model. */
const STEPS = CONVERSION_TARGETS.map((t) => ({
  ...t,
  fromLabel: LABELS[t.from] ?? t.from,
  toLabel: LABELS[t.to] ?? t.to,
}));

export default function Funnel(p: FunnelProps) {
  const { openDrill, now } = useDash();
  const since = now - TRAILING_WINDOW_DAYS * MS_DAY;
  const cr = closeRate(p.deals, now);
  const attempts = cr.won + cr.lost;
  // A manual override keeps the normal display even when nothing has closed.
  const { value: crResolved } = useResolved("closeRate", cr.rate);
  const barEmpty = cr.rate === null || cr.rate === 0;

  const closedDeals = (stage: "won" | "lost") =>
    p.deals.filter((d) => {
      const ts = d.entered[stage];
      return ts !== undefined && ts >= since;
    });

  return (
    <div className="grid gap-3 lg:grid-cols-[1fr_minmax(16rem,0.35fr)]">
        {/* stage-to-stage conversion */}
        <div className="flex flex-col justify-between gap-2 border border-rule bg-panel p-5 shadow-card sm:flex-row sm:items-center">
          {STEPS.map((step, i) => {
            const c = conversion(p.deals, step.from, step.to, now);
            const unavailable = (step.to === "pilot" || step.from === "pilot") && !p.pilotTracked;
            const onTarget = c.rate !== null && c.rate >= step.rate;
            return (
              <div key={step.from} className="flex items-center gap-2 sm:flex-1">
                <div className="flex-1">
                  <p className="microlabel">
                    {step.fromLabel} → {step.toLabel}
                  </p>
                  <p
                    className={`mt-1 text-3xl font-bold tracking-tight ${
                      unavailable || c.rate === null ? "" : onTarget ? "text-good" : "text-bad"
                    }`}
                  >
                    {unavailable ? (
                      <span className="font-mono text-ink-faint" title="No Pilot entry timestamps yet">
                        n/a
                      </span>
                    ) : (
                      <Metric
                        id={`conv:${step.from}-${step.to}`}
                        live={c.rate}
                        format={(v) => fmtPct(v)}
                        toInput={(v) => v * 100}
                        fromInput={(v) => v / 100}
                      />
                    )}
                  </p>
                  <p className="mt-0.5 whitespace-nowrap font-mono text-[11px] text-ink-faint">
                    {unavailable ? (
                      "awaiting pilot data"
                    ) : (
                      <span title={DEFINITIONS.convTarget}>
                        target {fmtPct(step.rate)} · {c.converted} of {c.cohort}
                      </span>
                    )}
                  </p>
                </div>
                {i < STEPS.length - 1 && (
                  <span aria-hidden className="hidden px-2 text-2xl text-rule-dark sm:block">
                    →
                  </span>
                )}
              </div>
            );
          })}
          <div className="sm:pl-3">
            <InfoTip text={DEFINITIONS.conv + " " + DEFINITIONS.convTarget} label="Conversion method" />
          </div>
        </div>

        {/* close rate vs 50% target */}
        <div className="border border-rule bg-panel p-5 shadow-card">
          <div className="flex items-center justify-between gap-2">
            <h3 className="microlabel">Close rate</h3>
            <InfoTip text={DEFINITIONS.closeRate} label="Close rate" />
          </div>
          {crResolved === null ? (
            <p className="mt-2 text-sm leading-snug text-ink-soft">No closed deals in the last 90 days yet</p>
          ) : (
            <p className="mt-1 text-4xl font-bold tracking-tight">
              <Metric
                id="closeRate"
                live={cr.rate}
                format={(v) => fmtPct(v)}
                toInput={(v) => v * 100}
                fromInput={(v) => v / 100}
              />
              <span className="ml-2 align-middle text-xs font-semibold text-ink-faint">target {fmtPct(CLOSE_RATE_TARGET)}</span>
            </p>
          )}
          {barEmpty ? (
            // nothing won yet: a deliberate empty track that says so, not a 0-width fill
            <div className={`relative mt-3 grid h-6 place-items-center ${EMPTY_TRACK}`} role="img"
              aria-label={
                attempts === 0
                  ? `No deals closed in the trailing ${TRAILING_WINDOW_DAYS} days; target ${fmtPct(CLOSE_RATE_TARGET)}`
                  : `Close rate 0%: ${cr.won} won of ${attempts} attempted, against a ${fmtPct(CLOSE_RATE_TARGET)} target`
              }>
              <div className="absolute -bottom-1 -top-1 w-[2px] bg-ink" style={{ left: `${CLOSE_RATE_TARGET * 100}%` }} title="50% target" />
              <span className="relative bg-panel px-1.5 font-mono text-[10px] text-ink-faint">
                {attempts === 0
                  ? `target ${fmtPct(CLOSE_RATE_TARGET)}`
                  : `${cr.won} won of ${attempts} attempted · target ${fmtPct(CLOSE_RATE_TARGET)}`}
              </span>
            </div>
          ) : (
            <div className="relative mt-3 h-3 bg-paper outline outline-1 outline-rule-dark" role="img"
              aria-label={`Close rate ${fmtPct(cr.rate)} against a ${fmtPct(CLOSE_RATE_TARGET)} target`}>
              <div
                className={`h-full ${cr.rate !== null && cr.rate >= CLOSE_RATE_TARGET ? "bg-good" : "bg-warn"}`}
                style={{ width: `${Math.min(100, (cr.rate ?? 0) * 100)}%` }}
              />
              <div className="absolute top-[-5px] h-[22px] w-[2px] bg-ink" style={{ left: `${CLOSE_RATE_TARGET * 100}%` }} title="50% target" />
            </div>
          )}
          <p className="mt-2.5 font-mono text-[11px] text-ink-faint">
            <button
              type="button"
              className="underline decoration-rule-dark underline-offset-2 hover:text-accent"
              onClick={() =>
                openDrill({
                  title: `Closed Won — trailing ${TRAILING_WINDOW_DAYS} days`,
                  deals: closedDeals("won"),
                  dateOf: (d) => d.entered.won,
                  dateLabel: "Closed won",
                })
              }
            >
              {fmtNum(cr.won)} won
            </button>
            {" · "}
            <button
              type="button"
              className="underline decoration-rule-dark underline-offset-2 hover:text-accent"
              onClick={() =>
                openDrill({
                  title: `Closed Lost — trailing ${TRAILING_WINDOW_DAYS} days`,
                  deals: closedDeals("lost"),
                  dateOf: (d) => d.entered.lost,
                  dateLabel: "Closed lost",
                })
              }
            >
              {fmtNum(cr.lost)} lost
            </button>
          </p>
        </div>
    </div>
  );
}
