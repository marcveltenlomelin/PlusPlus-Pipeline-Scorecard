"use client";

import { useMemo } from "react";
import {
  Bar,
  BarChart,
  Cell,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { DEFINITIONS, STAGE_LABELS } from "@/lib/config";
import { enteredInPeriod } from "@/lib/metrics";
import { lastNPeriods, periodLabel } from "@/lib/periods";
import type { Deal, Granularity, StageKey } from "@/lib/types";
import { useDash } from "./ctx";
import { InfoTip } from "./Metric";

const INK = "#1b1d20";
const ACCENT = "#1c41e8";
const FAINT = "#878d95";

interface TrendsProps {
  deals: Deal[];
  granularity: Granularity;
  period: string;
  goalFor: (stage: "sal" | "nno") => number;
}

const PANELS: { stage: StageKey; title: string; goal?: "sal" | "nno" }[] = [
  { stage: "sal", title: "SALs created", goal: "sal" },
  { stage: "sql", title: "Net New Opps", goal: "nno" },
  { stage: "deepdive", title: "Deep Dives" },
  { stage: "won", title: "Closed Won" },
];

export default function Trends(p: TrendsProps) {
  const { openDrill, now } = useDash();
  const n = p.granularity === "quarter" ? 8 : 12;
  const keys = useMemo(() => lastNPeriods(p.granularity, n, now), [p.granularity, n, now]);

  return (
    <section aria-label="Trend over time">
      <div className="mb-3 flex items-baseline justify-between gap-3">
        <h2 className="font-display text-base font-bold tracking-tight">
          Trend <span className="text-ink-faint">— last {n} {p.granularity}s</span>
        </h2>
        <p className="hidden text-[11px] text-ink-faint sm:block">click a bar to see the deals behind it</p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {PANELS.map((panel) => {
          const data = keys.map((k) => ({
            key: k,
            label: periodLabel(k, { short: true }),
            count: enteredInPeriod(p.deals, panel.stage, k).count,
          }));
          const goal = panel.goal ? p.goalFor(panel.goal) : undefined;
          return (
            <article key={panel.stage} className="border border-rule bg-panel p-4 shadow-card">
              <div className="flex items-center justify-between gap-2">
                <h3 className="microlabel">{panel.title}</h3>
                <InfoTip text={DEFINITIONS[`tp:${panel.stage}`]} label={panel.title} />
              </div>
              <div className="mt-3 h-36">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={data} margin={{ top: 8, right: 4, left: -26, bottom: 0 }}>
                    <XAxis
                      dataKey="label"
                      tick={{ fontSize: 9, fill: FAINT, fontFamily: "var(--font-spline-mono)" }}
                      tickLine={false}
                      axisLine={{ stroke: "#e3dfd3" }}
                      interval={p.granularity === "quarter" ? 0 : 2}
                    />
                    <YAxis
                      allowDecimals={false}
                      tick={{ fontSize: 9, fill: FAINT, fontFamily: "var(--font-spline-mono)" }}
                      tickLine={false}
                      axisLine={false}
                      width={30}
                    />
                    <Tooltip
                      cursor={{ fill: "rgba(27,29,32,0.05)" }}
                      contentStyle={{
                        border: "1px solid #c6c1b1",
                        borderRadius: 0,
                        fontSize: 11,
                        fontFamily: "var(--font-spline-mono)",
                        background: "#fffefb",
                      }}
                      formatter={(v) => [v as number, `entered ${STAGE_LABELS[panel.stage]}`]}
                      labelFormatter={(label, pl) => {
                        const k = (pl?.[0]?.payload as { key?: string })?.key;
                        return k ? periodLabel(k) : String(label ?? "");
                      }}
                    />
                    {goal !== undefined && (
                      <ReferenceLine
                        y={goal}
                        stroke={ACCENT}
                        strokeDasharray="4 3"
                        label={{ value: "goal", fontSize: 9, fill: ACCENT, position: "insideTopRight" }}
                      />
                    )}
                    <Bar
                      dataKey="count"
                      radius={[1, 1, 0, 0]}
                      cursor="pointer"
                      isAnimationActive={false}
                      onClick={(entry) => {
                        const k = (entry as unknown as { payload: { key: string } }).payload?.key;
                        if (!k) return;
                        const bucket = enteredInPeriod(p.deals, panel.stage, k);
                        openDrill({
                          title: `${panel.title} — ${periodLabel(k)}`,
                          subtitle: DEFINITIONS[`tp:${panel.stage}`],
                          deals: bucket.deals,
                          dateOf: (d) => d.entered[panel.stage],
                        });
                      }}
                    >
                      {data.map((d) => (
                        <Cell key={d.key} fill={d.key === p.period ? ACCENT : INK} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}
