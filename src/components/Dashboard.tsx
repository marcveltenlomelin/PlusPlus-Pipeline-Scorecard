"use client";

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { STAGE_GOALS } from "@/lib/config";
import { periodKey, periodPhrase } from "@/lib/periods";
import type { DealsPayload, GoalStage, Granularity, StageKey, Store } from "@/lib/types";
import { headlineWindows } from "@/lib/headline";
import { DashCtx, type DrillSpec } from "./ctx";
import Drilldown from "./Drilldown";
import Funnel from "./Funnel";
import Headline from "./Headline";
import FunnelTrend from "./FunnelTrend";
import Header from "./Header";
import Pace from "./Pace";
import Revenue, { OpenDeals, RevenueMath } from "./Revenue";
import Scoreboard from "./Scoreboard";
import SkeletonOverlay, { type SkeletonKind } from "./Skeleton";
import TodayFocus from "./TodayFocus";

/** Uniform chapter treatment: hairline rule, 64px of air, uppercase header, plain-English subtitle. */
function Section({
  title,
  subtitle,
  delay,
  loading,
  skeleton,
  error,
  onRetry,
  children,
}: {
  title: string;
  subtitle: string;
  delay: number;
  /** A refresh is in flight — cover the content with a shimmer skeleton. */
  loading?: boolean;
  skeleton?: SkeletonKind;
  /** The last refresh failed — show an inline chip; stale data stays usable. */
  error?: string | null;
  onRetry?: () => void;
  children: ReactNode;
}) {
  return (
    <section
      data-section={title}
      aria-label={title}
      aria-busy={loading || undefined}
      className="rise border-t border-rule pt-16"
      style={{ animationDelay: `${delay}ms` }}
    >
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="text-sm font-bold uppercase tracking-[0.05em] text-ink-soft">{title}</h2>
        {error && (
          <span
            role="status"
            title={error}
            className="inline-flex items-center gap-1.5 border border-bad/40 bg-bad-soft px-2 py-0.5 text-[11px] text-bad"
          >
            {"Couldn't refresh"} ·
            <button
              type="button"
              onClick={onRetry}
              className="font-semibold underline underline-offset-2 hover:opacity-75"
            >
              Retry
            </button>
          </span>
        )}
      </div>
      <p className="mt-1 text-xs text-ink-faint">{subtitle}</p>
      <div className="relative mt-4">
        {children}
        {loading && skeleton && <SkeletonOverlay kind={skeleton} />}
      </div>
    </section>
  );
}

type Payload = DealsPayload & { pilotStageId: string | null };

function defaultGoals(): Store["goals"] {
  return Object.fromEntries(
    Object.entries(STAGE_GOALS).map(([k, v]) => [k, { ...v }])
  ) as Store["goals"];
}

export default function Dashboard() {
  // The page is statically prerendered; date-derived UI must not hydrate
  // against a stale build-time clock.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const [now, setNow] = useState(() => Date.now());
  const [granularity, setGranularity] = useState<Granularity>("month");
  const [period, setPeriod] = useState(() => periodKey(Date.now(), "month"));
  const [payload, setPayload] = useState<Payload | null>(null);
  const [store, setStore] = useState<Store>({ goals: defaultGoals(), overrides: {} });
  const [drill, setDrill] = useState<DrillSpec | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  /** Skeletons show while a refresh's deals fetch is in flight (never on first load). */
  const [syncing, setSyncing] = useState(false);
  /** Last sync failure. With data on screen → per-section chips; without → page banner. */
  const [syncError, setSyncError] = useState<string | null>(null);
  const [activeSection, setActiveSection] = useState<string | null>(null);

  // Scroll-aware nav indicator: a section is "current" while it overlaps a thin
  // band just under the sticky nav. IntersectionObserver only — no scroll listeners.
  useEffect(() => {
    if (!payload) return;
    const els = Array.from(document.querySelectorAll<HTMLElement>("main [data-section]"));
    if (els.length === 0) return;
    const navH = (document.querySelector("header")?.offsetHeight ?? 72) + 1;
    const bandBottom = Math.max(window.innerHeight - navH - 12, 0);
    const hit = new Map(els.map((el) => [el.dataset.section as string, false]));
    let atEnd = false; // the last section's header can never reach the band — the footer stands in for it
    const recompute = () => {
      if (atEnd) {
        setActiveSection(els[els.length - 1].dataset.section as string);
        return;
      }
      const passed = els.filter((el) => hit.get(el.dataset.section as string));
      if (passed.length > 0) {
        setActiveSection(passed[passed.length - 1].dataset.section as string);
      } else if (els[0].getBoundingClientRect().top > navH) {
        setActiveSection(null); // back above the first section header
      }
      // in the gaps between sections, keep the last section's name
    };
    const observer = new IntersectionObserver(
      (entries) => {
        for (const e of entries) hit.set((e.target as HTMLElement).dataset.section as string, e.isIntersecting);
        recompute();
      },
      { rootMargin: `-${navH}px 0px -${bandBottom}px 0px`, threshold: 0 }
    );
    els.forEach((el) => observer.observe(el));
    const footer = document.querySelector("main footer");
    const endObserver = footer
      ? new IntersectionObserver(
          (entries) => {
            atEnd = entries[entries.length - 1].intersectionRatio >= 0.99;
            recompute();
          },
          { threshold: [0.99] }
        )
      : null;
    if (footer && endObserver) endObserver.observe(footer);
    return () => {
      observer.disconnect();
      endObserver?.disconnect();
    };
  }, [payload]);

  // Deals and store load independently — each applies the moment it lands, so
  // sections never wait on the slower of the two. (All sections derive from the
  // single deals payload by design; that one fetch is the only deal "query".)
  const load = useCallback(async (refresh: boolean) => {
    setRefreshing(true);
    if (refresh) setSyncing(true);
    const dealsChain = (async () => {
      const res = await fetch(`/api/deals${refresh ? "?refresh=1" : ""}`);
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? `Sync failed (${res.status})`);
      }
      setPayload(await res.json());
      setNow(Date.now());
      setSyncError(null);
    })()
      .catch((err) => {
        setSyncError(err instanceof Error ? err.message : "Sync failed");
      })
      .finally(() => setSyncing(false));
    const storeChain = fetch("/api/store")
      .then(async (res) => {
        if (res.ok) setStore(await res.json());
      })
      .catch(() => {
        // goals/overrides keep their previous values; deals are the headline
      });
    await Promise.allSettled([dealsChain, storeChain]);
    setRefreshing(false);
  }, []);

  useEffect(() => {
    void load(false);
  }, [load]);

  const patchStore = useCallback(async (body: object) => {
    const res = await fetch("/api/store", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (res.ok) setStore(await res.json());
  }, []);

  const ctx = useMemo(
    () => ({
      overrides: store.overrides,
      setOverride: (id: string, value: number) =>
        void patchStore({ setOverrides: { [id]: { value, at: Date.now() } } }),
      clearOverride: (id: string) => void patchStore({ clearOverrides: [id] }),
      openDrill: setDrill,
      now,
    }),
    [store.overrides, patchStore, now]
  );

  /** Per-period goal for a stage at the active granularity (Lost has none). */
  const goalFor = useCallback(
    (stage: StageKey): number | undefined => {
      if (stage === "lost") return undefined;
      const g = store.goals[stage as GoalStage];
      if (!g) return undefined;
      // explicit month/quarter/year values from the model; weeks derive
      return granularity === "week" ? (g.month * 12) / 52 : g[granularity];
    },
    [store.goals, granularity]
  );

  const onGranularity = (g: Granularity) => {
    setGranularity(g);
    setPeriod(periodKey(now, g));
  };

  const onGoalSave = (stage: GoalStage, perPeriod: number) => {
    if (granularity === "week") {
      void patchStore({ goals: { [stage]: { month: (perPeriod * 52) / 12 } } });
    } else {
      void patchStore({ goals: { [stage]: { [granularity]: perPeriod } } });
    }
  };

  const onGoalReset = (stage: GoalStage) => {
    void patchStore({ goals: { [stage]: { ...STAGE_GOALS[stage] } } });
  };

  const phrase = periodPhrase(period, now);

  if (!mounted) {
    return (
      <div className="grid min-h-screen place-items-center text-sm text-ink-faint" role="status">
        <div className="flex animate-pulse flex-col items-center gap-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/plusplus-logo.png" alt="PlusPlus" className="size-12" />
          <p className="font-mono">loading scoreboard…</p>
        </div>
      </div>
    );
  }

  return (
    <DashCtx.Provider value={ctx}>
      <Header
        granularity={granularity}
        period={period}
        now={now}
        payload={payload}
        section={activeSection}
        refreshing={refreshing}
        onGranularity={onGranularity}
        onPeriod={setPeriod}
        onRefresh={() => void load(true)}
      />

      <main className="mx-auto max-w-6xl space-y-10 px-5 py-8 sm:px-8">
        {payload?.source === "demo" && (
          <p className="rise border border-accent/30 bg-accent-soft px-4 py-2.5 text-xs text-ink-soft">
            <strong className="font-bold text-accent">Demo data.</strong> No{" "}
            <code className="font-mono">HUBSPOT_TOKEN</code> found — showing generated sample deals so every view
            can be reviewed. Add the token to <code className="font-mono">.env.local</code> and refresh to go live.
          </p>
        )}
        {payload?.source === "cache" && (
          <p className="rise border border-warn/40 bg-warn-soft px-4 py-2.5 text-xs text-ink-soft">
            <strong className="font-bold text-warn">Showing last good sync.</strong> Live fetch failed:{" "}
            {payload.error ?? "unknown error"}. Numbers reflect the previous sync — hit Refresh to retry.
          </p>
        )}
        {syncError && !payload && (
          <p className="border border-bad/40 bg-bad-soft px-4 py-2.5 text-xs text-bad" role="alert">
            <strong className="font-bold">Sync failed:</strong> {syncError}
          </p>
        )}

        {!payload && !syncError && (
          <div className="grid place-items-center py-32 text-sm text-ink-faint" role="status">
            <p className="font-mono animate-pulse">syncing with HubSpot…</p>
          </div>
        )}

        {payload && (
          <>
            <TodayFocus
              deals={payload.deals}
              goals={store.goals}
              now={now}
              pilotTracked={payload.pilotTracked}
              syncing={syncing}
              onRefresh={() => void load(true)}
            />
            <Section
              title={`Headline · ${headlineWindows(now, granularity).label}`}
              subtitle="The business in one line — win rate, cycle time, and deal size, with the prior window for contrast."
              delay={0}
              loading={syncing}
              skeleton="cards"
              error={syncError}
              onRetry={() => void load(true)}
            >
              <Headline deals={payload.deals} granularity={granularity} />
            </Section>
            <Section
              title="Stage Entries"
              subtitle={`Deals that entered each stage ${phrase} — actual against goal, not board occupancy.`}
              delay={0}
              loading={syncing}
              skeleton="cards"
              error={syncError}
              onRetry={() => void load(true)}
            >
              <Scoreboard
                deals={payload.deals}
                period={period}
                granularity={granularity}
                pilotTracked={payload.pilotTracked}
                pilotStageId={payload.pilotStageId}
                goalFor={goalFor}
                onGoalSave={onGoalSave}
                onGoalReset={onGoalReset}
              />
            </Section>
            <Section
              title="Funnel Trend"
              subtitle={`How many deals hit each stage, ${granularity} by ${granularity}.`}
              delay={60}
              loading={syncing}
              skeleton="chart"
              error={syncError}
              onRetry={() => void load(true)}
            >
              <FunnelTrend
                deals={payload.deals}
                granularity={granularity}
                period={period}
                pilotTracked={payload.pilotTracked}
                goalFor={goalFor}
              />
            </Section>
            <Section
              title="Pace to Goal"
              subtitle={`Are SALs and Net New Opps on pace for ${phrase}?`}
              delay={120}
              loading={syncing}
              skeleton="bars"
              error={syncError}
              onRetry={() => void load(true)}
            >
              <Pace
                deals={payload.deals}
                period={period}
                granularity={granularity}
                goalFor={goalFor}
                onGoalSave={onGoalSave}
                onGoalReset={onGoalReset}
              />
            </Section>
            <Section
              title="Funnel Leaks"
              subtitle="Where deals stall — stage-to-stage conversion over the trailing 90 days."
              delay={180}
              loading={syncing}
              skeleton="cards"
              error={syncError}
              onRetry={() => void load(true)}
            >
              <Funnel deals={payload.deals} pilotTracked={payload.pilotTracked} />
            </Section>
            <Section
              title="Revenue"
              subtitle="Dollars created and closed against the $1.2M net-new ARR target."
              delay={240}
              loading={syncing}
              skeleton="cards"
              error={syncError}
              onRetry={() => void load(true)}
            >
              <Revenue deals={payload.deals} period={period} granularity={granularity} />
            </Section>
            <Section
              title="Open Deals"
              subtitle="Every open deal on the board, biggest first — the audit trail behind the numbers."
              delay={300}
              loading={syncing}
              skeleton="table"
              error={syncError}
              onRetry={() => void load(true)}
            >
              <OpenDeals deals={payload.deals} />
            </Section>
            <Section
              title="Revenue Math"
              subtitle="The bottom line: closed-won run rate × average deal size, straight-lined to Dec 31."
              delay={360}
              loading={syncing}
              skeleton="row"
              error={syncError}
              onRetry={() => void load(true)}
            >
              <RevenueMath deals={payload.deals} />
            </Section>

            <footer className="border-t border-rule pt-5 text-[11px] leading-relaxed text-ink-faint">
              <p className="max-w-3xl">
                <strong className="font-semibold text-ink-soft">Why these numbers differ from the HubSpot board:</strong>{" "}
                the board shows where deals sit <em>right now</em> (occupancy); this scoreboard counts deals that{" "}
                <em>entered</em> each stage during a period (throughput), so closed periods never change. Every figure
                has an <span className="font-mono">i</span> definition and clicks through to the exact HubSpot deals
                behind it. Values marked <span className="bg-manual-soft px-1 font-bold uppercase text-manual">manual</span>{" "}
                were set by hand and revert to live with ↺. Periods bucket in your local timezone; weeks start Monday.
              </p>
            </footer>
          </>
        )}
      </main>

      {drill && <Drilldown spec={drill} onClose={() => setDrill(null)} />}
    </DashCtx.Provider>
  );
}
