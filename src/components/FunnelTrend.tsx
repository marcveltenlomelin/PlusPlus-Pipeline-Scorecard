"use client";

import { useMemo, useState } from "react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { DEFINITIONS } from "@/lib/config";
import { enteredInPeriod } from "@/lib/metrics";
import { lastNPeriods, periodLabel } from "@/lib/periods";
import type { Deal, Granularity, StageKey } from "@/lib/types";
import { useDash } from "./ctx";
import { InfoTip } from "./Metric";

// chart palette — keep in sync with @theme tokens in globals.css
const ACCENT = "#6e87ff";
const FAINT = "#797d84";
const RULE = "#2a2d32";
const RULE_DARK = "#41454c";
const PANEL = "#1b1e22";
const INK = "#ebe9e2";

interface Series {
  stage: StageKey;
  label: string;
  color: string;
  /** Is an increase good news? Flips the arrow color for Closed Lost. */
  goodWhenUp: boolean;
  goal?: "sal" | "nno";
}

const SERIES: Series[] = [
  { stage: "sal", label: "SAL", color: "#d9d7d0", goodWhenUp: true, goal: "sal" },
  { stage: "sql", label: "SQL · NNO", color: ACCENT, goodWhenUp: true, goal: "nno" },
  { stage: "deepdive", label: "Deep Dive", color: "#b08bff", goodWhenUp: true },
  { stage: "pilot", label: "Pilot", color: "#3fc1c9", goodWhenUp: true },
  { stage: "won", label: "Closed Won", color: "#46c188", goodWhenUp: true },
  { stage: "lost", label: "Closed Lost", color: "#e66257", goodWhenUp: false },
];

interface FunnelTrendProps {
  deals: Deal[];
  granularity: Granularity;
  period: string;
  pilotTracked: boolean;
  goalFor: (stage: StageKey) => number | undefined;
}

export default function FunnelTrend(p: FunnelTrendProps) {
  const { openDrill, now } = useDash();
  const n = p.granularity === "quarter" ? 8 : p.granularity === "year" ? 4 : 12;
  const series = SERIES.filter((s) => s.stage !== "pilot" || p.pilotTracked);
  const [hidden, setHidden] = useState<Set<StageKey>>(new Set());

  const keys = useMemo(() => lastNPeriods(p.granularity, n, now), [p.granularity, n, now]);
  const data = useMemo(
    () =>
      keys.map((k) => {
        const row: Record<string, number | string> = { key: k, label: periodLabel(k, { short: true }) };
        for (const s of series) row[s.stage] = enteredInPeriod(p.deals, s.stage, k).count;
        return row;
      }),
    [keys, p.deals, series]
  );

  // Direction compares the last two COMPLETED periods — stable mid-period.
  const direction = (stage: StageKey): { delta: number; prev: number } => {
    const a = data[data.length - 3]?.[stage] as number | undefined; // before last complete
    const b = data[data.length - 2]?.[stage] as number | undefined; // last complete
    return { delta: (b ?? 0) - (a ?? 0), prev: b ?? 0 };
  };

  const unit =
    p.granularity === "week" ? "wk" : p.granularity === "month" ? "mo" : p.granularity === "quarter" ? "qtr" : "yr";

  const drillPoint = (stage: StageKey, key: string) => {
    const s = series.find((x) => x.stage === stage);
    const bucket = enteredInPeriod(p.deals, stage, key);
    openDrill({
      title: `${s?.label ?? stage} — ${periodLabel(key)}`,
      subtitle: DEFINITIONS[`tp:${stage}`],
      deals: bucket.deals,
      dateOf: (d) => d.entered[stage],
    });
  };

  return (
    <div>
      <p className="mb-2 hidden text-right text-[11px] text-ink-faint sm:block">
        last {n} {p.granularity}s · click a stage to focus · click a point to see its deals
      </p>

      <div className="border border-rule bg-panel p-4 shadow-card sm:p-5">
        {/* per-stage direction strip — doubles as a series toggle */}
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6" role="group" aria-label="Stages">
          {series.map((s) => {
            const cur = enteredInPeriod(p.deals, s.stage, p.period).count;
            const { delta } = direction(s.stage);
            const off = hidden.has(s.stage);
            const deltaGood = delta === 0 ? null : (delta > 0) === s.goodWhenUp;
            return (
              <button
                key={s.stage}
                type="button"
                aria-pressed={!off}
                onClick={() =>
                  setHidden((h) => {
                    const next = new Set(h);
                    if (next.has(s.stage)) next.delete(s.stage);
                    else next.add(s.stage);
                    return next;
                  })
                }
                title={`${s.label}: ${off ? "show" : "hide"} series. Direction compares the last two completed ${p.granularity}s.`}
                className={`border px-2.5 py-2 text-left transition-opacity ${
                  off ? "border-rule opacity-40" : "border-rule-dark"
                }`}
              >
                <span className="flex items-center gap-1.5">
                  <span aria-hidden className="size-2 shrink-0 rounded-full" style={{ background: s.color }} />
                  <span className="microlabel truncate">{s.label}</span>
                </span>
                <span className="mt-1 flex items-baseline gap-1.5">
                  <span className="font-mono text-xl font-bold">{cur}</span>
                  <span
                    className={`font-mono text-[11px] font-semibold ${
                      deltaGood === null ? "text-ink-faint" : deltaGood ? "text-good" : "text-bad"
                    }`}
                  >
                    {delta === 0 ? "→ flat" : `${delta > 0 ? "▲" : "▼"} ${Math.abs(delta)}/${unit}`}
                  </span>
                </span>
              </button>
            );
          })}
        </div>

        <div className="mt-4 h-72">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data} margin={{ top: 10, right: 12, left: -4, bottom: 0 }}>
              <CartesianGrid stroke={RULE} vertical={false} />
              <XAxis
                dataKey="label"
                tick={{ fontSize: 10, fill: FAINT, fontFamily: "var(--font-roboto-mono)" }}
                tickLine={false}
                axisLine={{ stroke: RULE_DARK }}
              />
              <YAxis
                allowDecimals={false}
                // make room for visible goal lines (extendDomain is unreliable here)
                domain={[
                  0,
                  (dataMax: number) =>
                    Math.ceil(
                      Math.max(
                        dataMax,
                        ...series.map((s) => (hidden.has(s.stage) ? 0 : p.goalFor(s.stage) ?? 0))
                      ) * 1.08
                    ),
                ]}
                tick={{ fontSize: 10, fill: FAINT, fontFamily: "var(--font-roboto-mono)" }}
                tickLine={false}
                axisLine={false}
                width={34}
              />
              <Tooltip
                cursor={{ stroke: RULE_DARK }}
                contentStyle={{
                  border: `1px solid ${RULE_DARK}`,
                  borderRadius: 0,
                  fontSize: 11,
                  fontFamily: "var(--font-roboto-mono)",
                  background: PANEL,
                  color: INK,
                }}
                labelFormatter={(label, pl) => {
                  const k = (pl?.[0]?.payload as { key?: string })?.key;
                  return k ? periodLabel(k) : String(label ?? "");
                }}
              />
              {/* one dashed goal line per visible stage, in the stage's color;
                  goals sit close together (6/5/4/2), so the colors carry the
                  labeling instead of overlapping text */}
              {series
                .filter((s) => !hidden.has(s.stage))
                .map((s) => {
                  const goal = p.goalFor(s.stage);
                  if (goal === undefined) return null;
                  return (
                    <ReferenceLine
                      key={`goal-${s.stage}`}
                      y={goal}
                      ifOverflow="extendDomain"
                      stroke={s.color}
                      strokeDasharray="4 3"
                      strokeOpacity={0.45}
                      label={
                        s.stage === "sal"
                          ? { value: "goals", fontSize: 9, fill: FAINT, position: "insideTopRight" }
                          : undefined
                      }
                    />
                  );
                })}
              {series
                .filter((s) => !hidden.has(s.stage))
                .map((s) => (
                  <Line
                    key={s.stage}
                    type="monotone"
                    dataKey={s.stage}
                    name={s.label}
                    stroke={s.color}
                    strokeWidth={s.stage === "sal" || s.stage === "sql" ? 2.5 : 1.75}
                    dot={false}
                    isAnimationActive={false}
                    activeDot={{
                      r: 5,
                      cursor: "pointer",
                      onClick: (_e: unknown, pt: unknown) => {
                        const k = (pt as { payload?: { key?: string } })?.payload?.key;
                        if (k) drillPoint(s.stage, k);
                      },
                    }}
                  />
                ))}
            </LineChart>
          </ResponsiveContainer>
        </div>

        <p className="mt-2 flex items-center gap-1.5 text-[11px] text-ink-faint">
          <InfoTip
            text={`Each solid line counts deals that ENTERED the stage per ${p.granularity} — throughput, not board occupancy. Each dashed line is that stage's goal from the goal model, in the same color. The rightmost point is the current ${p.granularity} in progress, so it usually sits low. Direction arrows compare the last two completed ${p.granularity}s.`}
            label="Funnel trend"
          />
          dashed line = that stage’s goal (same color) · rightmost point = current {p.granularity} in progress · arrows
          compare the last two completed {p.granularity}s
        </p>
      </div>
    </div>
  );
}
