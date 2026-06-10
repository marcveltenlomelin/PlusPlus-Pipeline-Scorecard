"use client";

import { useEffect, useRef, useState } from "react";
import { fmtNum } from "@/lib/format";
import type { PacingState } from "@/lib/metrics";
import { useDash, useResolved } from "./ctx";

/** Shared dismiss-on-outside-click / Escape behavior for small popovers. */
function usePop() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);
  return { open, setOpen, ref };
}

const POP_PANEL =
  "absolute left-1/2 top-full z-40 mt-2 block w-64 -translate-x-1/2 border border-rule-dark bg-panel p-3 text-left text-xs font-normal normal-case leading-relaxed tracking-normal text-ink-soft shadow-pop";

/** Small info popover — every number's definition, one keypress away. */
export function InfoTip({ text, label }: { text: string; label?: string }) {
  const { open, setOpen, ref } = usePop();
  return (
    <span ref={ref} className="relative inline-block">
      <button
        type="button"
        aria-expanded={open}
        aria-label={label ? `Definition: ${label}` : "Definition"}
        onClick={() => setOpen(!open)}
        className="grid size-4 place-items-center rounded-full border border-rule-dark text-[9px] font-bold text-ink-soft transition-colors hover:border-accent hover:text-accent"
      >
        i
      </button>
      {open && (
        <span role="tooltip" className={POP_PANEL}>
          {text}
        </span>
      )}
    </span>
  );
}

const PACING_STYLE: Record<PacingState, { label: string; cls: string }> = {
  ahead: { label: "ahead", cls: "bg-ahead-soft text-ahead hover:bg-ahead hover:text-paper" },
  "on-pace": { label: "on pace", cls: "bg-good-soft text-good hover:bg-good hover:text-paper" },
  "slightly-behind": { label: "slightly behind", cls: "bg-warn-soft text-warn hover:bg-warn hover:text-paper" },
  "at-risk": { label: "at risk", cls: "bg-bad-soft text-bad hover:bg-bad hover:text-white" },
};

/**
 * The pacing flag — clickable, and it shows its work: actual vs where the
 * goal says the stage should be by this point in the period.
 */
export function PaceBadge({
  state,
  actual,
  expected, // goal prorated to time elapsed
  ratio,
  periodPhrase,
}: {
  state: PacingState;
  actual: number;
  expected: number;
  ratio: number;
  periodPhrase: string;
}) {
  const { open, setOpen, ref } = usePop();
  const { label, cls } = PACING_STYLE[state];
  return (
    <span ref={ref} className="relative inline-block">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
        className={`whitespace-nowrap px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider transition-colors ${cls}`}
      >
        {label}
      </button>
      {open && (
        <span role="tooltip" className={POP_PANEL}>
          <strong className="text-ink">
            Expected by today: {fmtNum(expected)} · Actual: {fmtNum(actual)} · Pace: {Math.round(ratio * 100)}%
          </strong>{" "}
          Straight-line: the goal, prorated to how much of {periodPhrase} has elapsed.
        </span>
      )}
    </span>
  );
}

interface MetricProps {
  /** Stable override key, e.g. "tp:sal:2026-06". */
  id: string;
  live: number | null;
  format: (n: number) => string;
  /** Convert stored value → editable number and back (e.g. rates ↔ percents). */
  toInput?: (v: number) => number;
  fromInput?: (v: number) => number;
  onDrill?: () => void;
  drillLabel?: string;
  className?: string;
  /** Called instead of the override store (used by goals). */
  onSave?: (v: number) => void;
  onRevert?: () => void;
  /**
   * For goal-type metrics: true when the value differs from the model
   * default. Shows a quiet reset arrow instead of the MANUAL badge —
   * goals are set by hand by design, so they don't get flagged.
   */
  edited?: boolean;
}

/**
 * A displayed value with the full manual layer: override by hand, flagged as
 * MANUAL, revertible to live in one click, and (when wired) click-through to
 * the deals behind it.
 */
export function Metric({
  id,
  live,
  format,
  toInput = (v) => v,
  fromInput = (v) => v,
  onDrill,
  drillLabel,
  className = "",
  onSave,
  onRevert,
  edited,
}: MetricProps) {
  const { setOverride, clearOverride } = useDash();
  const { value, manual } = useResolved(id, live);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing) inputRef.current?.select();
  }, [editing]);

  const startEdit = () => {
    setDraft(value !== null ? String(+toInput(value).toFixed(2)) : "");
    setEditing(true);
  };

  const save = () => {
    const n = Number(draft);
    if (Number.isFinite(n)) {
      const v = fromInput(n);
      if (onSave) onSave(v);
      else setOverride(id, v);
    }
    setEditing(false);
  };

  const revert = () => {
    if (onRevert) onRevert();
    else clearOverride(id);
  };

  if (editing) {
    return (
      <span className={`inline-flex items-baseline gap-1.5 ${className}`}>
        <input
          ref={inputRef}
          type="number"
          step="any"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") save();
            if (e.key === "Escape") setEditing(false);
          }}
          onBlur={save}
          aria-label="Edit value"
          className="w-[5.5em] border border-accent bg-accent-soft px-1 font-mono text-[0.9em] text-ink outline-none"
        />
      </span>
    );
  }

  const display = value !== null ? format(value) : "—";

  return (
    <span className={`group/metric inline-flex items-baseline gap-1.5 ${className}`}>
      {onDrill && value !== null ? (
        <button
          type="button"
          onClick={onDrill}
          aria-label={drillLabel ?? "View the deals behind this number"}
          title={drillLabel ?? "View the deals behind this number"}
          className="cursor-pointer font-mono underline decoration-rule-dark decoration-2 underline-offset-[6px] transition-colors hover:text-accent hover:decoration-accent"
        >
          {display}
        </button>
      ) : onSave ? (
        // goal-type values edit on click — no badge, no ceremony
        <button
          type="button"
          onClick={startEdit}
          title="Click to edit this goal"
          className="cursor-pointer font-mono decoration-rule-dark underline-offset-[3px] hover:underline hover:text-accent"
        >
          {display}
        </button>
      ) : (
        <span className="font-mono">{display}</span>
      )}

      {manual ? (
        <span className="inline-flex translate-y-[-0.15em] items-center gap-1">
          <button
            type="button"
            onClick={startEdit}
            title="Manually overridden — click to edit"
            className="bg-manual-soft px-1 py-px text-[9px] font-bold uppercase tracking-wider text-manual hover:underline"
          >
            manual
          </button>
          <button
            type="button"
            onClick={revert}
            aria-label="Revert to live value"
            title="Revert to live value"
            className="grid size-4 place-items-center rounded-full text-[11px] text-manual hover:bg-manual-soft"
          >
            ↺
          </button>
        </span>
      ) : edited && onRevert ? (
        <button
          type="button"
          onClick={revert}
          aria-label="Reset to the goal model default"
          title="Edited by hand — click to reset to the goal model default"
          className="translate-y-[-0.15em] text-[11px] text-ink-faint hover:text-accent"
        >
          ↺
        </button>
      ) : !onSave ? (
        <button
          type="button"
          onClick={startEdit}
          aria-label="Override this value manually"
          title="Override this value manually"
          className="translate-y-[-0.15em] text-[11px] text-ink-faint opacity-0 transition-opacity hover:text-accent focus-visible:opacity-100 group-hover/metric:opacity-100"
        >
          ✎
        </button>
      ) : null}
    </span>
  );
}
