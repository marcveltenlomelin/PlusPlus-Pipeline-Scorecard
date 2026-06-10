"use client";

import { DEFINITIONS } from "@/lib/config";
import { fmtNum } from "@/lib/format";
import { enteredInPeriod, pace } from "@/lib/metrics";
import { isCurrentPeriod, periodPhrase } from "@/lib/periods";
import type { Deal, GoalStage, Granularity, StageKey } from "@/lib/types";
import { useDash, useResolved } from "./ctx";
import { InfoTip, Metric } from "./Metric";
import { defaultGoal } from "./Scoreboard";

interface PaceProps {
  deals: Deal[];
  period: string;
  granularity: Granularity;
  goalFor: (stage: StageKey) => number | undefined;
  onGoalSave: (stage: GoalStage, perPeriodValue: number) => void;
  onGoalReset: (stage: GoalStage) => void;
}

const STATUS_STYLE = {
  done: { chip: "bg-good-soft text-good", label: "goal hit" },
  ahead: { chip: "bg-good-soft text-good", label: "ahead" },
  "on-track": { chip: "bg-good-soft text-good", label: "on track" },
  behind: { chip: "bg-bad-soft text-bad", label: "behind" },
} as const;

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
  const style = STATUS_STYLE[m.status];
  const pct = (n: number) => Math.min(100, (n / Math.max(goal, 0.0001)) * 100);

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
          <span className={`px-2 py-1 text-[10px] font-bold uppercase tracking-wider ${style.chip}`}>
            {style.label}
          </span>
          <InfoTip text={DEFINITIONS.pace + " " + DEFINITIONS.goal} label={`${title} pace`} />
        </div>
      </div>

      {/* progress: actual fill, expected-by-today tick, goal = full track */}
      <div className="relative mt-5 h-3 w-full bg-paper outline outline-1 outline-rule-dark" role="img"
        aria-label={`${fmtNum(actual ?? 0)} of ${fmtNum(goal)}; expected by today ${fmtNum(m.expected)}; projected ${fmtNum(m.projected)}`}>
        <div
          className={`h-full transition-[width] duration-500 ${m.status === "behind" ? "bg-bad" : "bg-good"}`}
          style={{ width: `${pct(m.actual)}%` }}
        />
        {current && (
          <div
            className="absolute top-[-5px] h-[22px] w-[2px] bg-ink"
            style={{ left: `${pct(m.expected)}%` }}
            title={`Expected by today: ${fmtNum(m.expected)}`}
          />
        )}
      </div>

      <dl className="mt-3 grid grid-cols-3 gap-2 text-center">
        <div>
          <dt className="text-[10px] uppercase tracking-wider text-ink-faint">Actual</dt>
          <dd className="font-mono text-sm font-semibold">{fmtNum(actual ?? 0)}</dd>
        </div>
        <div>
          <dt className="text-[10px] uppercase tracking-wider text-ink-faint">
            {current ? "Expected today" : "Goal"}
          </dt>
          <dd className="font-mono text-sm font-semibold">{fmtNum(current ? m.expected : goal)}</dd>
        </div>
        <div>
          <dt className="text-[10px] uppercase tracking-wider text-ink-faint">
            {current ? "Projected finish" : "Attainment"}
          </dt>
          <dd className={`font-mono text-sm font-semibold ${m.status === "behind" ? "text-bad" : "text-good"}`}>
            {current ? fmtNum(Math.round(m.projected * 10) / 10) : `${Math.round((m.actual / goal) * 100)}%`}
          </dd>
        </div>
      </dl>
    </article>
  );
}

export default function Pace(p: PaceProps) {
  const { openDrill, now } = useDash();
  const phrase = periodPhrase(p.period, now);
  const sal = enteredInPeriod(p.deals, "sal", p.period);
  const nno = enteredInPeriod(p.deals, "sql", p.period);

  return (
    <section aria-label="Pace to goal">
      <h2 className="mb-3 font-display text-base font-bold tracking-tight">
        Pace to goal <span className="text-ink-faint">— {phrase}</span>
      </h2>
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
    </section>
  );
}
