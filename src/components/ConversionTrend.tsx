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
import { conversionTrendRows, type RatePoint } from "@/lib/conversionTrend";
import type { Deal } from "@/lib/types";
import { useDash } from "./ctx";
import { InfoTip } from "./Metric";

// chart palette — keep in sync with @theme tokens in globals.css (FunnelTrend idiom)
const FAINT = "#797d84";
const RULE = "#2a2d32";
const RULE_DARK = "#41454c";
const PANEL = "#1b1e22";
const INK = "#ebe9e2";

/** Series colors echo the destination stage's FunnelTrend color; Close Rate is warn amber. */
const SERIES_COLOR: Record<string, string> = {
  sal_sql: "#6e87ff",
  sql_deepdive: "#b08bff",
  deepdive_pilot: "#3fc1c9",
  pilot_won: "#46c188",
  close: "#e0a14d",
};

interface ConversionTrendProps {
  deals: Deal[];
  pilotTracked: boolean;
}

interface TooltipEntry {
  dataKey?: string | number;
  payload?: Record<string, unknown>;
}

export default function ConversionTrend(p: ConversionTrendProps) {
  const { now } = useDash();
  const [hidden, setHidden] = useState<Set<string>>(new Set());

  const { series, rows } = useMemo(
    () => conversionTrendRows(p.deals, now, p.pilotTracked),
    [p.deals, now, p.pilotTracked]
  );
  const visible = series.filter((s) => !hidden.has(s.key));

  // Direction compares the last two COMPLETED months — stable mid-month.
  const direction = (key: string): number | null => {
    const a = rows[rows.length - 3]?.[key] as number | null | undefined;
    const b = rows[rows.length - 2]?.[key] as number | null | undefined;
    if (a == null || b == null) return null;
    return b - a;
  };

  const tooltipContent = ({ active, payload, label }: { active?: boolean; payload?: TooltipEntry[]; label?: unknown }) => {
    if (!active || !payload?.length) return null;
    const row = payload[0]?.payload ?? {};
    return (
      <div
        style={{ border: `1px solid ${RULE_DARK}`, background: PANEL, color: INK }}
        className="px-2.5 py-2 font-mono text-[11px] leading-relaxed"
      >
        <p className="font-bold">{String(label ?? "")}</p>
        {visible.map((s) => {
          const meta = row[`${s.key}Meta`] as RatePoint | undefined;
          if (!meta || meta.rate === null) return null;
          return (
            <p key={s.key} className="flex items-center gap-1.5">
              <span aria-hidden className="inline-block size-2 rounded-full" style={{ background: SERIES_COLOR[s.key] }} />
              {s.label} {Math.round(meta.rate * 100)}% · {meta.num} of {meta.den}
              {meta.lowSample && <span style={{ color: FAINT }}> · low sample</span>}
            </p>
          );
        })}
      </div>
    );
  };

  return (
    <div>
      <p className="mb-2 hidden text-right text-[11px] text-ink-faint sm:block">
        last 12 months · rolling 90-day windows · click a transition to focus
      </p>

      <div className="border border-rule bg-panel p-4 shadow-card sm:p-5">
        {/* per-transition chip strip — doubles as the series toggle (FunnelTrend idiom) */}
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5" role="group" aria-label="Transitions">
          {series.map((s) => {
            const off = hidden.has(s.key);
            const latest = rows[rows.length - 1]?.[s.key] as number | null;
            const delta = direction(s.key);
            return (
              <button
                key={s.key}
                type="button"
                aria-pressed={!off}
                onClick={() =>
                  setHidden((h) => {
                    const next = new Set(h);
                    if (next.has(s.key)) next.delete(s.key);
                    else next.add(s.key);
                    return next;
                  })
                }
                title={`${s.label}: ${off ? "show" : "hide"} series. Direction compares the last two completed months.`}
                className={`border px-2.5 py-2 text-left transition-opacity ${
                  off ? "border-rule opacity-40" : "border-rule-dark"
                }`}
              >
                <span className="flex items-center gap-1.5">
                  <span aria-hidden className="size-2 shrink-0 rounded-full" style={{ background: SERIES_COLOR[s.key] }} />
                  <span className="microlabel truncate">{s.label}</span>
                </span>
                <span className="mt-1 flex items-baseline gap-1.5">
                  <span className="font-mono text-xl font-bold">
                    {latest === null || latest === undefined ? "—" : `${Math.round(latest)}%`}
                  </span>
                  <span
                    className={`font-mono text-[11px] font-semibold ${
                      delta === null || delta === 0 ? "text-ink-faint" : delta > 0 ? "text-good" : "text-bad"
                    }`}
                  >
                    {delta === null ? "" : delta === 0 ? "→ flat" : `${delta > 0 ? "▲" : "▼"} ${Math.abs(Math.round(delta))}pts`}
                  </span>
                </span>
              </button>
            );
          })}
        </div>

        <div className="mt-4 h-72">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={rows} margin={{ top: 10, right: 12, left: -4, bottom: 0 }}>
              <CartesianGrid stroke={RULE} vertical={false} />
              <XAxis
                dataKey="label"
                tick={{ fontSize: 10, fill: FAINT, fontFamily: "var(--font-roboto-mono)" }}
                tickLine={false}
                axisLine={{ stroke: RULE_DARK }}
              />
              <YAxis
                domain={[0, 100]}
                ticks={[0, 25, 50, 75, 100]}
                tickFormatter={(v: number) => `${v}%`}
                tick={{ fontSize: 10, fill: FAINT, fontFamily: "var(--font-roboto-mono)" }}
                tickLine={false}
                axisLine={false}
                width={40}
              />
              <Tooltip cursor={{ stroke: RULE_DARK }} content={tooltipContent} />
              {/* one dashed target line per visible transition, in its color */}
              {visible.map((s) => (
                <ReferenceLine
                  key={`target-${s.key}`}
                  y={s.target * 100}
                  stroke={SERIES_COLOR[s.key]}
                  strokeDasharray="4 3"
                  strokeOpacity={0.45}
                />
              ))}
              {/* dimmed dashed base line (all points) under a solid overlay whose
                  low-sample points are nulled — confident spans read solid */}
              {visible.map((s) => (
                <Line
                  key={`${s.key}-base`}
                  type="monotone"
                  dataKey={s.key}
                  stroke={SERIES_COLOR[s.key]}
                  strokeWidth={1.5}
                  strokeOpacity={0.35}
                  strokeDasharray="3 2"
                  dot={false}
                  isAnimationActive={false}
                  connectNulls
                />
              ))}
              {visible.map((s) => (
                <Line
                  key={`${s.key}-hi`}
                  type="monotone"
                  dataKey={`${s.key}Hi`}
                  stroke={SERIES_COLOR[s.key]}
                  strokeWidth={2.25}
                  dot={false}
                  isAnimationActive={false}
                  activeDot={{ r: 4 }}
                />
              ))}
            </LineChart>
          </ResponsiveContainer>
        </div>

        <p className="mt-2 flex items-center gap-1.5 text-[11px] text-ink-faint">
          <InfoTip
            text="Each point is the rolling-90-day rate AS OF that month's end — conversions that happened later don't color earlier months, so recent points sit low while their cohorts are still in flight. Solid spans have 5+ attempts in the window; dimmed dashed spans are low-sample. Dashed horizontal lines are the goal-model targets, in the matching color."
            label="Conversion trends"
          />
          dashed horizontal = target (same color) · dimmed span = fewer than 5 attempts · recent months still maturing
        </p>
      </div>
    </div>
  );
}
