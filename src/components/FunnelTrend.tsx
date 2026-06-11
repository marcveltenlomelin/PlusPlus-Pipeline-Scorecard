"use client";

import { useEffect, useMemo, useState } from "react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceDot,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { DEFINITIONS } from "@/lib/config";
import { fmtDate } from "@/lib/format";
import { enteredInPeriod } from "@/lib/metrics";
import { lastNPeriods, periodKey, periodLabel, periodStart } from "@/lib/periods";
import type { AnnotationColor, AnnotationOp, ChartAnnotation, Deal, Granularity, StageKey } from "@/lib/types";
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
  annotations: ChartAnnotation[];
  userEmail: string | null;
  isAdmin: boolean;
  onAnnotations: (op: AnnotationOp) => void | Promise<void>;
}

/** Annotation color presets → CSS tokens (SVG-safe via var(), no new hex). */
const NOTE_COLORS: Record<AnnotationColor, string> = {
  accent: "var(--color-accent)",
  good: "var(--color-good)",
  warn: "var(--color-warn)",
  bad: "var(--color-bad)",
  ahead: "var(--color-ahead)",
};

/** Inline editor state: creating on a month, or editing an existing note. */
interface NoteEditor {
  monthIso: string;
  existing?: ChartAnnotation;
}

/** Form for creating/editing a note — title, description, color swatches. */
function NoteForm({
  editor,
  onSave,
  onClose,
}: {
  editor: NoteEditor;
  onSave: (title: string, description: string, color: AnnotationColor) => void;
  onClose: () => void;
}) {
  const [title, setTitle] = useState(editor.existing?.title ?? "");
  const [description, setDescription] = useState(editor.existing?.description ?? "");
  const [color, setColor] = useState<AnnotationColor>(editor.existing?.color ?? "accent");
  return (
    <div className="rise w-72 border border-rule-dark bg-panel p-3 shadow-pop" onMouseDown={(e) => e.stopPropagation()}>
      <p className="microlabel">
        {editor.existing ? "Edit note" : "Add note"} · {periodLabel(editor.monthIso)}
      </p>
      <input
        autoFocus
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        maxLength={60}
        placeholder="Title (required)"
        aria-label="Note title"
        className="mt-2 w-full border border-rule bg-paper px-2 py-1.5 text-sm text-ink placeholder:text-ink-faint focus:border-accent focus:outline-none"
      />
      <p className="mt-0.5 text-right font-mono text-[10px] text-ink-faint">{title.length}/60</p>
      <textarea
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        maxLength={280}
        rows={3}
        placeholder="Description (optional)"
        aria-label="Note description"
        className="w-full border border-rule bg-paper px-2 py-1.5 text-xs text-ink placeholder:text-ink-faint focus:border-accent focus:outline-none"
      />
      <p className="mt-0.5 text-right font-mono text-[10px] text-ink-faint">{description.length}/280</p>
      <div className="mt-1 flex items-center gap-2" role="radiogroup" aria-label="Note color">
        {(Object.keys(NOTE_COLORS) as AnnotationColor[]).map((c) => (
          <button
            key={c}
            type="button"
            role="radio"
            aria-checked={color === c}
            title={c}
            onClick={() => setColor(c)}
            className={`size-5 rounded-full border-2 ${color === c ? "border-ink" : "border-transparent"}`}
            style={{ background: NOTE_COLORS[c] }}
          />
        ))}
      </div>
      <div className="mt-3 flex justify-end gap-2">
        <button type="button" onClick={onClose} className="px-2.5 py-1 text-xs text-ink-soft hover:text-ink">
          Cancel
        </button>
        <button
          type="button"
          disabled={!title.trim()}
          onClick={() => onSave(title, description, color)}
          className="bg-accent px-3 py-1 text-xs font-semibold text-white hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
        >
          Save
        </button>
      </div>
    </div>
  );
}

export default function FunnelTrend(p: FunnelTrendProps) {
  const { openDrill, now } = useDash();
  const n = p.granularity === "quarter" ? 8 : p.granularity === "year" ? 4 : 12;
  const series = SERIES.filter((s) => s.stage !== "pilot" || p.pilotTracked);
  const [hidden, setHidden] = useState<Set<StageKey>>(new Set());
  const [showNotes, setShowNotes] = useState(true);
  const [hoverLabel, setHoverLabel] = useState<string | null>(null);
  const [editor, setEditor] = useState<NoteEditor | null>(null);
  const [detailId, setDetailId] = useState<string | null>(null);

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

  // Annotations are month-keyed; map each into its containing chart bucket
  // (identity at month granularity; weeks/quarters/years stack their months).
  const notesByLabel = useMemo(() => {
    const map = new Map<string, ChartAnnotation[]>();
    if (!showNotes) return map;
    for (const a of p.annotations) {
      const bucket = periodKey(periodStart(a.monthIso).getTime() + 1, p.granularity);
      if (!keys.includes(bucket)) continue;
      const label = periodLabel(bucket, { short: true });
      map.set(label, [...(map.get(label) ?? []), a]);
    }
    return map;
  }, [p.annotations, p.granularity, keys, showNotes]);

  const detail = detailId ? p.annotations.find((a) => a.id === detailId) ?? null : null;
  const canEdit = (a: ChartAnnotation) => p.isAdmin || (p.userEmail !== null && a.authorEmail === p.userEmail);

  // overlays close on Escape
  useEffect(() => {
    if (!editor && !detailId) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setEditor(null);
        setDetailId(null);
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [editor, detailId]);

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

      <div className="relative border border-rule bg-panel p-4 shadow-card sm:p-5">
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
          <button
            type="button"
            aria-pressed={showNotes}
            onClick={() => setShowNotes((v) => !v)}
            title={`${showNotes ? "Hide" : "Show"} team annotations on the chart`}
            className={`border px-2.5 py-2 text-left transition-opacity ${
              showNotes ? "border-rule-dark" : "border-rule opacity-40"
            }`}
          >
            <span className="flex items-center gap-1.5">
              <span aria-hidden className="text-[10px] leading-none text-accent">▼</span>
              <span className="microlabel truncate">Notes</span>
            </span>
            <span className="mt-1 block font-mono text-xl font-bold">{p.annotations.length}</span>
          </button>
        </div>

        {hoverLabel && showNotes && p.granularity === "month" && !editor && !detail && (
          <button
            type="button"
            onClick={() => {
              const key = keys.find((k) => periodLabel(k, { short: true }) === hoverLabel);
              if (key) setEditor({ monthIso: key });
            }}
            className="absolute right-3 top-3 z-10 border border-dashed border-rule-dark bg-panel px-2.5 py-1.5 text-xs text-ink-soft hover:border-accent hover:text-accent"
          >
            + Add note · {hoverLabel}
          </button>
        )}

        <div className="mt-4 h-72">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart
              data={data}
              margin={{ top: 10, right: 12, left: -4, bottom: 0 }}
              onMouseMove={(s) => setHoverLabel(typeof s?.activeLabel === "string" ? s.activeLabel : null)}
              onMouseLeave={() => setHoverLabel(null)}
            >
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
              {/* team annotations: ▼ markers sitting just above the X axis */}
              {[...notesByLabel.entries()].flatMap(([label, notes]) =>
                notes.map((a, i) => (
                  <ReferenceDot
                    key={a.id}
                    x={label}
                    y={0}
                    ifOverflow="visible"
                    shape={(props: unknown) => {
                      const { cx, cy } = props as { cx: number; cy: number };
                      const x = cx + i * 12; // stack same-period notes sideways
                      return (
                        <path
                          d={`M ${x - 5} ${cy - 15} L ${x + 5} ${cy - 15} L ${x} ${cy - 4} Z`}
                          style={{ fill: NOTE_COLORS[a.color], cursor: "pointer" }}
                          role="button"
                          aria-label={`Note: ${a.title}`}
                          onClick={() => setDetailId(a.id)}
                        >
                          <title>{`${a.title} — ${a.authorEmail} · ${fmtDate(a.createdAt)}`}</title>
                        </path>
                      );
                    }}
                  />
                ))
              )}
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

        {(editor || detail) && (
          <div
            className="absolute inset-0 z-20 grid place-items-center bg-paper/40"
            onMouseDown={() => {
              setEditor(null);
              setDetailId(null);
            }}
          >
            {editor ? (
              <NoteForm
                editor={editor}
                onClose={() => setEditor(null)}
                onSave={(title, description, color) => {
                  void p.onAnnotations(
                    editor.existing
                      ? { kind: "update", id: editor.existing.id, title, description: description || undefined, color }
                      : { kind: "create", monthIso: editor.monthIso, title, description: description || undefined, color }
                  );
                  setEditor(null);
                }}
              />
            ) : detail ? (
              <div
                className="rise w-72 border border-rule-dark bg-panel p-3 shadow-pop"
                role="dialog"
                aria-label={detail.title}
                onMouseDown={(e) => e.stopPropagation()}
              >
                <div className="flex items-start justify-between gap-2">
                  <p className="flex items-center gap-1.5 text-sm font-semibold">
                    <span aria-hidden className="text-[10px]" style={{ color: NOTE_COLORS[detail.color] }}>▼</span>
                    {detail.title}
                  </p>
                  <button type="button" aria-label="Close" onClick={() => setDetailId(null)} className="text-ink-faint hover:text-ink">
                    ✕
                  </button>
                </div>
                {detail.description && (
                  <p className="mt-1.5 text-xs leading-relaxed text-ink-soft">{detail.description}</p>
                )}
                <p className="mt-2 font-mono text-[10px] text-ink-faint">
                  {detail.authorEmail} · {fmtDate(detail.createdAt)}
                  {detail.updatedAt > detail.createdAt ? " · edited" : ""}
                </p>
                {canEdit(detail) && (
                  <div className="mt-2.5 flex justify-end gap-2 border-t border-rule pt-2">
                    <button
                      type="button"
                      onClick={() => {
                        setEditor({ monthIso: detail.monthIso, existing: detail });
                        setDetailId(null);
                      }}
                      className="px-2 py-1 text-xs text-accent hover:underline"
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        void p.onAnnotations({ kind: "delete", id: detail.id });
                        setDetailId(null);
                      }}
                      className="px-2 py-1 text-xs text-bad hover:underline"
                    >
                      Delete
                    </button>
                  </div>
                )}
              </div>
            ) : null}
          </div>
        )}

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
