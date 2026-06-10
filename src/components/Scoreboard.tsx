"use client";

import { AT_RISK_THRESHOLD, DEFINITIONS, STAGE_GOALS, STAGE_LABELS } from "@/lib/config";
import { fmtMoney, fmtNum } from "@/lib/format";
import { enteredInPeriod, occupancy } from "@/lib/metrics";
import { elapsedFraction, isCurrentPeriod, periodPhrase, shiftPeriod } from "@/lib/periods";
import type { Deal, GoalStage, Granularity, StageKey } from "@/lib/types";
import { useDash, useResolved } from "./ctx";
import { InfoTip, Metric, RiskBadge } from "./Metric";

/** Model-default goal at a granularity (weeks derive from the month value). */
export function defaultGoal(stage: GoalStage, g: Granularity): number {
  return g === "week" ? (STAGE_GOALS[stage].month * 12) / 52 : STAGE_GOALS[stage][g];
}

interface ScoreboardProps {
  deals: Deal[];
  period: string;
  granularity: Granularity;
  pilotTracked: boolean;
  pilotStageId: string | null;
  goalFor: (stage: StageKey) => number | undefined;
  onGoalSave: (stage: GoalStage, perPeriodValue: number) => void;
  onGoalReset: (stage: GoalStage) => void;
}

const DATE_LABEL: Partial<Record<StageKey, string>> = {
  sal: "Created",
  sql: "Entered SQL",
  deepdive: "Entered Deep Dive",
  pilot: "Entered Pilot",
  won: "Closed won",
  lost: "Closed lost",
};

function StageCard({
  stage,
  deals,
  period,
  granularity,
  goal,
  sublabel,
  onGoalSave,
  onGoalReset,
}: {
  stage: StageKey;
  deals: Deal[];
  period: string;
  granularity: Granularity;
  goal?: number;
  sublabel?: string;
  onGoalSave?: (v: number) => void;
  onGoalReset?: () => void;
}) {
  const { openDrill, now } = useDash();
  const phrase = periodPhrase(period, now);
  const cur = enteredInPeriod(deals, stage, period);
  const before = enteredInPeriod(deals, stage, shiftPeriod(period, -1));
  const delta = cur.count - before.count;
  const defKey = `tp:${stage}`;
  const title = stage === "sql" ? "SQL · Net New Opps" : STAGE_LABELS[stage];
  const verb = stage === "sal" ? "created" : "entered";

  // honor a manual override of the actual when judging risk
  const { value: actual } = useResolved(`tp:${stage}:${period}`, cur.count);
  // prorate the goal for the period in progress; full goal once it closes
  const elapsed = isCurrentPeriod(period, now) ? elapsedFraction(period, now) : 1;
  const expected = goal !== undefined ? goal * elapsed : 0;
  const atRisk = goal !== undefined && (actual ?? 0) < AT_RISK_THRESHOLD * expected;
  const goalEdited =
    goal !== undefined && stage !== "lost" && Math.abs(goal - defaultGoal(stage as GoalStage, granularity)) > 0.01;

  return (
    <article className="border border-rule bg-panel p-4 shadow-card">
      <div className="flex items-center justify-between gap-2">
        <h3 className="microlabel">{title}</h3>
        <span className="flex items-center gap-1.5">
          {atRisk && (
            <RiskBadge actual={actual ?? 0} goal={goal!} expected={expected} periodPhrase={phrase} />
          )}
          <InfoTip
            text={DEFINITIONS[defKey] + (stage === "sql" ? " " + DEFINITIONS.nno : "")}
            label={title}
          />
        </span>
      </div>
      <p className="mt-2 whitespace-nowrap text-4xl font-bold tracking-tight">
        <Metric
          id={`tp:${stage}:${period}`}
          live={cur.count}
          format={fmtNum}
          onDrill={() =>
            openDrill({
              title: `${title} — ${verb} ${phrase}`,
              subtitle: DEFINITIONS[defKey],
              deals: cur.deals,
              dateOf: (d) => d.entered[stage],
              dateLabel: DATE_LABEL[stage],
            })
          }
          drillLabel={`View the ${cur.count} deals behind this number`}
        />
        {goal !== undefined && (
          <span className="ml-1.5 text-base font-semibold text-ink-faint">
            of{" "}
            <Metric
              id={`goal:${stage}:${period}`}
              live={goal}
              format={fmtNum}
              onSave={onGoalSave}
              onRevert={onGoalReset}
              edited={goalEdited}
              className="text-base"
            />
          </span>
        )}
      </p>
      <p className="mt-1.5 flex flex-wrap items-center gap-x-2 font-mono text-[11px] text-ink-faint">
        {sublabel && <span>{sublabel}</span>}
        <span title={`vs the previous ${granularity}`}>
          {delta > 0 ? `↑ ${delta}` : delta < 0 ? `↓ ${Math.abs(delta)}` : "—"} vs prior
        </span>
      </p>
    </article>
  );
}

export default function Scoreboard(p: ScoreboardProps) {
  const { openDrill, now } = useDash();
  const phrase = periodPhrase(p.period, now);
  const won = enteredInPeriod(p.deals, "won", p.period);

  const card = (stage: StageKey, sublabel?: string) => (
    <StageCard
      key={stage}
      stage={stage}
      deals={p.deals}
      period={p.period}
      granularity={p.granularity}
      goal={p.goalFor(stage)}
      sublabel={sublabel}
      onGoalSave={stage !== "lost" ? (v) => p.onGoalSave(stage as GoalStage, v) : undefined}
      onGoalReset={stage !== "lost" ? () => p.onGoalReset(stage as GoalStage) : undefined}
    />
  );

  // Pilot: throughput (with goal) once entry timestamps exist; occupancy until then.
  const pilotCard = () => {
    if (p.pilotTracked) return card("pilot");
    const occ = p.pilotStageId ? occupancy(p.deals, p.pilotStageId) : { count: 0, totalValue: 0, deals: [] };
    return (
      <article key="pilot" className="border border-dashed border-rule-dark bg-panel p-4 shadow-card">
        <div className="flex items-center justify-between gap-2">
          <h3 className="microlabel">Pilot</h3>
          <InfoTip text={DEFINITIONS["occ:pilot"]} label="Pilot" />
        </div>
        <p className="mt-2 text-4xl font-bold tracking-tight">
          <Metric
            id="occ:pilot"
            live={occ.count}
            format={fmtNum}
            onDrill={() =>
              openDrill({
                title: "Pilot (Review) — in stage right now",
                subtitle: DEFINITIONS["occ:pilot"],
                deals: occ.deals,
                dateLabel: "Created",
              })
            }
            drillLabel={`View the ${occ.count} deals currently in Pilot`}
          />
        </p>
        <p className="mt-1.5 text-[11px] font-semibold uppercase tracking-wider text-warn">
          in stage now — not period throughput
        </p>
      </article>
    );
  };

  return (
    <section aria-label={`Throughput ${phrase}`}>
      <div className="mb-3 flex items-baseline justify-between gap-3">
        <h2 className="font-display text-base font-bold tracking-tight">
          Stage entries <span className="text-ink-faint">— {phrase}, actual of goal</span>
        </h2>
        <p className="hidden text-[11px] text-ink-faint sm:block">
          counts deals that <em>entered</em> each stage in the period · final once the period closes
        </p>
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
        {card("sal")}
        {card("sql")}
        {card("deepdive")}
        {pilotCard()}
        {card("won", fmtMoney(won.totalValue, { compact: true }))}
        {card("lost")}
      </div>
    </section>
  );
}
