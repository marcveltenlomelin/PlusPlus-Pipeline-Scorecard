"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { STAGE_GOALS } from "@/lib/config";
import { periodKey } from "@/lib/periods";
import type { DealsPayload, GoalStage, Granularity, StageKey, Store } from "@/lib/types";
import { DashCtx, type DrillSpec } from "./ctx";
import Drilldown from "./Drilldown";
import Funnel from "./Funnel";
import FunnelTrend from "./FunnelTrend";
import Header from "./Header";
import Pace from "./Pace";
import Revenue from "./Revenue";
import Scoreboard from "./Scoreboard";

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
  const [fatal, setFatal] = useState<string | null>(null);

  const load = useCallback(async (refresh: boolean) => {
    setRefreshing(true);
    try {
      const [dealsRes, storeRes] = await Promise.all([
        fetch(`/api/deals${refresh ? "?refresh=1" : ""}`),
        fetch("/api/store"),
      ]);
      if (!dealsRes.ok) {
        const body = await dealsRes.json().catch(() => ({}));
        throw new Error(body.error ?? `Sync failed (${dealsRes.status})`);
      }
      setPayload(await dealsRes.json());
      if (storeRes.ok) setStore(await storeRes.json());
      setNow(Date.now());
      setFatal(null);
    } catch (err) {
      setFatal(err instanceof Error ? err.message : "Sync failed");
    } finally {
      setRefreshing(false);
    }
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
        {fatal && (
          <p className="border border-bad/40 bg-bad-soft px-4 py-2.5 text-xs text-bad" role="alert">
            <strong className="font-bold">Sync failed:</strong> {fatal}
          </p>
        )}

        {!payload && !fatal && (
          <div className="grid place-items-center py-32 text-sm text-ink-faint" role="status">
            <p className="font-mono animate-pulse">syncing with HubSpot…</p>
          </div>
        )}

        {payload && (
          <>
            <div className="rise" style={{ animationDelay: "0ms" }}>
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
            </div>
            <div className="rise" style={{ animationDelay: "60ms" }}>
              <FunnelTrend
                deals={payload.deals}
                granularity={granularity}
                period={period}
                pilotTracked={payload.pilotTracked}
                goalFor={goalFor}
              />
            </div>
            <div className="rise" style={{ animationDelay: "120ms" }}>
              <Pace
                deals={payload.deals}
                period={period}
                granularity={granularity}
                goalFor={goalFor}
                onGoalSave={onGoalSave}
                onGoalReset={onGoalReset}
              />
            </div>
            <div className="rise" style={{ animationDelay: "180ms" }}>
              <Funnel deals={payload.deals} pilotTracked={payload.pilotTracked} />
            </div>
            <div className="rise" style={{ animationDelay: "240ms" }}>
              <Revenue deals={payload.deals} period={period} granularity={granularity} />
            </div>

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
