"use client";

import { useEffect, useMemo, useState } from "react";
import {
  hubspotDealsUrl,
  topFocusActions,
  type FocusAction,
  type FocusCategory,
} from "@/lib/todayFocus";
import type { Deal, GoalStage, StageGoal } from "@/lib/types";
import SkeletonOverlay from "./Skeleton";

interface TodayFocusProps {
  deals: Deal[];
  goals: Record<GoalStage, StageGoal>;
  now: number;
  pilotTracked: boolean;
  syncing: boolean;
  onRefresh: () => void;
}

const CHIP: Record<FocusCategory, string> = {
  "STALE DEAL": "bg-bad-soft text-bad",
  PACING: "bg-warn-soft text-warn",
  CONVERSION: "bg-accent-soft text-accent",
  REVIVAL: "bg-ahead-soft text-ahead",
  GOAL: "bg-good-soft text-good",
};

const STORAGE_KEY = "pp-focus-dismissed";

function localDateKey(now: number): string {
  const d = new Date(now);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** Dismissals live for one local day, then reset. */
function readDismissed(now: number): Set<string> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return new Set();
    const parsed = JSON.parse(raw) as { date?: string; ids?: string[] };
    if (parsed.date !== localDateKey(now) || !Array.isArray(parsed.ids)) return new Set();
    return new Set(parsed.ids);
  } catch {
    return new Set();
  }
}

function writeDismissed(now: number, ids: Set<string>): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ date: localDateKey(now), ids: [...ids] }));
  } catch {
    // private mode etc. — dismissals just won't persist
  }
}

function Cta({ action }: { action: FocusAction }) {
  const cls =
    "mt-4 block w-full bg-accent px-3 py-2 text-center text-sm font-semibold text-white hover:opacity-90";
  if (action.cta.href.startsWith("#section:")) {
    const name = action.cta.href.slice("#section:".length);
    return (
      <button
        type="button"
        className={cls}
        onClick={() =>
          document
            .querySelector(`[data-section="${name}"]`)
            ?.scrollIntoView({ behavior: "smooth", block: "start" })
        }
      >
        {action.cta.label}
      </button>
    );
  }
  return (
    <a href={action.cta.href} target="_blank" rel="noreferrer" className={cls}>
      {action.cta.label}
    </a>
  );
}

/**
 * The prescriptive hero: the day's 3 highest-leverage actions, computed from
 * the same payload the diagnostic sections below already render. Scoring is
 * pure (src/lib/todayFocus.ts); this component only owns dismissal state.
 */
export default function TodayFocus(p: TodayFocusProps) {
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());
  useEffect(() => {
    setDismissed(readDismissed(p.now));
    // read once per mount; `now` only moves on sync and the date key is stable within a day
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const actions = useMemo(
    () =>
      topFocusActions(
        { deals: p.deals, goals: p.goals, now: p.now, pilotTracked: p.pilotTracked },
        dismissed
      ),
    [p.deals, p.goals, p.now, p.pilotTracked, dismissed]
  );

  const dismiss = (id: string) => {
    setDismissed((prev) => {
      const next = new Set(prev);
      next.add(id);
      writeDismissed(p.now, next);
      return next;
    });
  };

  const dateLabel = new Date(p.now).toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
  });

  return (
    <div className="rise" aria-label="Today's focus" aria-busy={p.syncing || undefined}>
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="text-sm font-bold uppercase tracking-[0.05em] text-ink">
          Today&rsquo;s Focus <span className="text-ink-faint">· {dateLabel}</span>
        </h2>
        <button
          type="button"
          onClick={p.onRefresh}
          aria-label="Refresh actions"
          title="Re-sync and recompute today's actions"
          className="grid size-6 place-items-center border border-rule text-sm text-ink-faint hover:border-accent hover:text-accent"
        >
          ↻
        </button>
      </div>
      <p className="mt-1 text-xs text-ink-faint">
        The three highest-leverage moves right now, scored from the live pipeline below.
      </p>

      <div className="relative mt-4">
        {actions.length === 0 ? (
          <div className="flex flex-wrap items-center justify-between gap-4 border border-good/40 bg-panel px-6 py-5 shadow-pop">
            <p className="text-base font-semibold">
              Nothing urgent today. <span className="font-normal text-ink-soft">Use the time to prospect.</span>
            </p>
            <a
              href={hubspotDealsUrl()}
              target="_blank"
              rel="noreferrer"
              className="bg-accent px-4 py-2 text-sm font-semibold text-white hover:opacity-90"
            >
              Open HubSpot · New Deal ↗
            </a>
          </div>
        ) : (
          <div className="grid gap-3 md:grid-cols-3">
            {actions.map((a) => (
              <article key={a.id} className="relative flex flex-col border border-good/40 bg-panel p-5 shadow-pop">
                <div className="flex items-start justify-between gap-2">
                  <span className={`px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${CHIP[a.category]}`}>
                    {a.category}
                  </span>
                  <button
                    type="button"
                    onClick={() => dismiss(a.id)}
                    aria-label={`Dismiss for today: ${a.category}`}
                    title="Dismiss for today"
                    className="-mr-1 -mt-1 grid size-6 place-items-center text-ink-faint hover:text-ink"
                  >
                    ✕
                  </button>
                </div>
                <p className="mt-3 text-base font-semibold leading-snug">{a.diagnosis}</p>
                <p className="mt-2 flex-1 text-sm leading-relaxed text-ink-soft">{a.action}</p>
                <Cta action={a} />
              </article>
            ))}
          </div>
        )}
        {p.syncing && <SkeletonOverlay kind="cards" />}
      </div>
    </div>
  );
}
