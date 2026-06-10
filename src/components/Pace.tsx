"use client";

import { DEFINITIONS } from "@/lib/config";
import { fmtNum } from "@/lib/format";
import { enteredInPeriod, pace, pacingBadge, type PacingState } from "@/lib/metrics";
import { dayOfPeriod, granularityOf, isCurrentPeriod, periodPhrase } from "@/lib/periods";
import type { Deal, GoalStage, Granularity, StageKey } from "@/lib/types";
import { useDash, useResolved } from "./ctx";
import { EMPTY_TRACK, InfoTip, Metric, PaceBadge, POP_PANEL } from "./Metric";
import { defaultGoal } from "./Scoreboard";

interface PaceProps {
  deals: Deal[];
  period: string;
  granularity: Granularity;
  goalFor: (stage: StageKey) => number | undefined;
  onGoalSave: (stage: GoalStage, perPeriodValue: number) => void;
  onGoalReset: (stage: GoalStage) => void;
}

const FILL_STYLE: Record<PacingState, { bar: string; text: string }> = {
  ahead: { bar: "bg-ahead", text: "text-ahead" },
  "on-pace": { bar: "bg-good", text: "text-good" },
  "slightly-behind": { bar: "bg-warn", text: "text-warn" },
  "at-risk": { bar: "bg-bad", text: "text-bad" },
};

const PERIOD_END_PHRASE: Record<Granularity, string> = {
  week: "week end",
  month: "month end",
  quarter: "quarter end",
  year: "year end",
};

function PaceCard({
  title,
  stageKey,
  actualId,
  liveActual,
  goal,
  period,
  granularity,
  onGoalSave,
  onGoalReset,
  onDrill,
}: {
  title: string;
  stageKey: GoalStage;
  actualId: string;
  liveActual: number;
  goal: number;
  period: string;
  granularity: Granularity;
  onGoalSave: (v: number) => void;
  onGoalReset: () => void;
  onDrill: () => void;
}) {
  const { now } = useDash();
  const goalEdited = Math.abs(goal - defaultGoal(stageKey, granularity)) > 0.01;
  // pace math respects manual overrides of the actual
  const { value: actual } = useResolved(actualId, liveActual);
  const m = pace(actual ?? 0, goal, period, now);
  const current = isCurrentPeriod(period, now);
  const badge = pacingBadge(actual ?? 0, goal, period, now);
  const state: PacingState = badge?.state ?? "on-pace";
  const fill = FILL_STYLE[state];
  const pct = (n: number) => Math.min(100, (n / Math.max(goal, 0.0001)) * 100);
  const fillPct = pct(m.actual);
  const actualInside = fillPct >= 14; // narrower than this and the number sits outside the fill
  const projected = Math.round(m.projected * 10) / 10;
  const pctComplete = goal > 0 ? Math.round((m.actual / goal) * 100) : 0;
  const { day, total } = dayOfPeriod(period, now);
  const tooltip = current
    ? `Actual ${fmtNum(m.actual)} of goal ${fmtNum(goal)} · ${pctComplete}% complete · expected ${fmtNum(m.expected)} by day ${day} of ${total} · on track for ${fmtNum(projected)} by ${PERIOD_END_PHRASE[granularityOf(period)]}`
    : `Actual ${fmtNum(m.actual)} of goal ${fmtNum(goal)} · ${pctComplete}% attainment · period ended`;

  return (
    <article className="border border-rule bg-panel p-5 shadow-card">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="microlabel">{title}</h3>
          <p className="mt-2 text-[2.6rem] leading-none font-bold tracking-tight">
            <Metric id={actualId} live={liveActual} format={fmtNum} onDrill={onDrill} />
            <span className="ml-1 text-base font-semibold text-ink-faint">
              /{" "}
              <Metric
                id={`goal:${stageKey}:${period}`}
                live={goal}
                format={fmtNum}
                onSave={onGoalSave}
                onRevert={onGoalReset}
                edited={goalEdited}
                className="text-base"
              />
            </span>
          </p>
        </div>
        <div className="flex items-center gap-2">
          <PaceBadge
            state={state}
            actual={actual ?? 0}
            expected={m.expected}
            ratio={badge?.ratio ?? (m.expected > 0 ? (actual ?? 0) / m.expected : 1)}
            periodPhrase={periodPhrase(period, now)}
          />
          <InfoTip text={DEFINITIONS.pace + " " + DEFINITIONS.goal} label={`${title} pace`} />
        </div>
      </div>

      {/* progress: solid pacing-state fill, expected-today + projected markers, full track = goal */}
      <div
        className="group relative mt-4"
        role="img"
        aria-label={`${fmtNum(m.actual)} of ${fmtNum(goal)}; expected by today ${fmtNum(m.expected)}; projected ${fmtNum(m.projected)}`}
      >
        <div className="relative h-4 text-[9px] font-bold uppercase tracking-wider">
          {current && (
            <span
              className="absolute bottom-0.5 whitespace-nowrap text-ink"
              style={
                // keep the label glued to its marker: centered on it when there's room,
                // right-anchored to it once the marker drifts toward the goal label
                pct(m.expected) > 55
                  ? { right: `calc(${100 - pct(m.expected)}% + 0.3rem)` }
                  : { left: `clamp(4.5rem, ${pct(m.expected)}%, calc(100% - 9.5rem))`, transform: "translateX(-50%)" }
              }
            >
              Expected today · {fmtNum(m.expected)}
            </span>
          )}
          {!(current && pct(m.expected) > 82) && (
            <span className="absolute bottom-0.5 right-0 text-ink-faint">Goal · {fmtNum(goal)}</span>
          )}
        </div>

        <div className={`relative h-7 w-full ${m.actual <= 0 ? EMPTY_TRACK : "bg-ink/10"}`}>
          <div
            className={`flex h-full items-center justify-end ${fill.bar} transition-[width] duration-500`}
            style={{ width: `${fillPct}%` }}
          >
            {actualInside && (
              <span className="px-2 font-mono text-sm font-bold text-paper">{fmtNum(m.actual)}</span>
            )}
          </div>
          {!actualInside && (
            <span
              className={`absolute top-1/2 -translate-y-1/2 font-mono text-sm font-bold ${fill.text}`}
              style={{ left: `calc(${fillPct}% + 0.4rem)` }}
            >
              {fmtNum(m.actual)}
            </span>
          )}
          {current && (
            <>
              <div
                className="absolute -bottom-1 -top-1 w-[2px] -translate-x-1/2 bg-ink"
                style={{ left: `${pct(m.expected)}%` }}
              />
              <div
                className="absolute -bottom-1 -top-1 -translate-x-1/2 border-l-2 border-dashed border-accent"
                style={{ left: `${pct(m.projected)}%` }}
              />
            </>
          )}
        </div>

        {current && (
          <div className="relative h-4 text-[9px] font-bold uppercase tracking-wider">
            <span
              className="absolute top-1 -translate-x-1/2 whitespace-nowrap text-accent"
              style={{ left: `clamp(3.5rem, ${pct(m.projected)}%, calc(100% - 3.5rem))` }}
            >
              Projected · {fmtNum(projected)}
              {m.projected > goal ? " →" : ""}
            </span>
          </div>
        )}

        {/* opens upward: later sections are their own stacking contexts and would paint over a drop-down panel */}
        <span role="tooltip" className={`${POP_PANEL} invisible bottom-full !top-auto !mt-0 mb-2 group-hover:visible`}>
          {tooltip}
        </span>
      </div>
    </article>
  );
}

export default function Pace(p: PaceProps) {
  const { openDrill, now } = useDash();
  const phrase = periodPhrase(p.period, now);
  const sal = enteredInPeriod(p.deals, "sal", p.period);
  const nno = enteredInPeriod(p.deals, "sql", p.period);

  return (
    <div className="grid gap-3 md:grid-cols-2">
        <PaceCard
          title="SALs created"
          stageKey="sal"
          actualId={`tp:sal:${p.period}`}
          liveActual={sal.count}
          goal={p.goalFor("sal") ?? 0}
          period={p.period}
          granularity={p.granularity}
          onGoalSave={(v) => p.onGoalSave("sal", v)}
          onGoalReset={() => p.onGoalReset("sal")}
          onDrill={() =>
            openDrill({
              title: `SALs created ${phrase}`,
              subtitle: DEFINITIONS["tp:sal"],
              deals: sal.deals,
              dateOf: (d) => d.entered.sal,
              dateLabel: "Created",
            })
          }
        />
        <PaceCard
          title="Net New Opps (SQL entries)"
          stageKey="sql"
          actualId={`tp:sql:${p.period}`}
          liveActual={nno.count}
          goal={p.goalFor("sql") ?? 0}
          period={p.period}
          granularity={p.granularity}
          onGoalSave={(v) => p.onGoalSave("sql", v)}
          onGoalReset={() => p.onGoalReset("sql")}
          onDrill={() =>
            openDrill({
              title: `Net New Opps ${phrase}`,
              subtitle: DEFINITIONS.nno,
              deals: nno.deals,
              dateOf: (d) => d.entered.sql,
              dateLabel: "Entered SQL",
            })
          }
        />
    </div>
  );
}
