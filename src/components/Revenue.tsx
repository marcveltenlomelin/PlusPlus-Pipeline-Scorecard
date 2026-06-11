"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  ARR_TARGET,
  AVG_DEAL_SIZE,
  COVERAGE_TARGET,
  COVERAGE_WARN,
  DEFINITIONS,
  NET_NEW_OPP_STAGE,
  PIPELINE_PACE_PER_MONTH,
  STAGE_GOALS,
} from "@/lib/config";
import { daysAgo, fmtDate, fmtMoney, fmtPct } from "@/lib/format";
import {
  closeRate,
  enteredInPeriod,
  openPipeline,
  pipelineCoverage,
  valueEnteredBetween,
  weightedPipeline,
  weightedValue,
} from "@/lib/metrics";
import {
  AGE_BUCKETS,
  DEFAULT_SORT_DIR,
  VALUE_CHIPS,
  filterOpenDeals,
  sortOpenDeals,
  type SortDir,
  type SortKey,
} from "@/lib/openDeals";
import { periodPhrase } from "@/lib/periods";
import { dealStaleness } from "@/lib/stale";
import type { Deal, Granularity } from "@/lib/types";
import { useDash, useResolved } from "./ctx";
import { EMPTY_TRACK, InfoTip, Metric, StaleBadge, usePop } from "./Metric";
import OpenDealDrawer from "./OpenDealDrawer";
import { Avatar } from "./OwnerBreakdown";

interface RevenueProps {
  deals: Deal[];
  period: string;
  granularity: Granularity;
}

const PERIOD_FACTOR: Record<Granularity, number> = { week: 12 / 52, month: 1, quarter: 3, year: 12 };

function Tile({
  label,
  def,
  children,
  foot,
  bar,
}: {
  label: string;
  def: string;
  children: React.ReactNode;
  foot?: React.ReactNode;
  bar?: { value: number; target: number };
}) {
  return (
    <article className="border border-rule bg-panel p-4 shadow-card">
      <div className="flex items-center justify-between gap-2">
        <h3 className="microlabel">{label}</h3>
        <InfoTip text={def} label={label} />
      </div>
      <p className="mt-2 text-[1.7rem] leading-none font-bold tracking-tight">{children}</p>
      {bar && (
        <div
          className={`mt-3 h-2 ${bar.value <= 0 ? EMPTY_TRACK : "bg-paper outline outline-1 outline-rule-dark"}`}
          role="img"
          aria-label={`${fmtMoney(bar.value, { compact: true })} of ${fmtMoney(bar.target, { compact: true })}`}
        >
          {bar.value > 0 && (
            <div
              className={`h-full ${bar.value >= bar.target ? "bg-good" : "bg-accent"}`}
              style={{ width: `${Math.min(100, (bar.value / bar.target) * 100)}%` }}
            />
          )}
        </div>
      )}
      {foot && <p className="mt-2 font-mono text-[11px] leading-relaxed text-ink-faint">{foot}</p>}
    </article>
  );
}

export default function Revenue(p: RevenueProps) {
  const { openDrill, now } = useDash();
  // Raw $ = activity view; Weighted $ = forecast view (value × stage win probability)
  const [weighted, setWeighted] = useState(false);
  const phrase = periodPhrase(p.period, now);
  const year = new Date(now).getFullYear();
  const yearStart = new Date(year, 0, 1).getTime();
  const monthsElapsed = (now - yearStart) / (365.25 / 12 * 86_400_000);

  const pipePeriod = enteredInPeriod(p.deals, NET_NEW_OPP_STAGE, p.period);
  const pipeYtd = valueEnteredBetween(p.deals, NET_NEW_OPP_STAGE, yearStart, now);
  const wonYtd = valueEnteredBetween(p.deals, "won", yearStart, now);
  const open = openPipeline(p.deals, NET_NEW_OPP_STAGE);
  const cr = closeRate(p.deals, now);
  // the projection honors a manual close-rate override
  const { value: crResolved } = useResolved("closeRate", cr.rate);
  const projected = wonYtd.totalValue + open.totalValue * (crResolved ?? 0);

  const periodTarget = PIPELINE_PACE_PER_MONTH * PERIOD_FACTOR[p.granularity];
  const ytdPaceTarget = PIPELINE_PACE_PER_MONTH * monthsElapsed;

  const money = (n: number) => fmtMoney(n, { compact: true });

  // weighted lens: the pipeline-value tiles swap to expected value; closed-won
  // is identical either way (weight 1) and Projected ARR keeps its own
  // close-rate model (weighting it again would double-count probability)
  const wpipe = weightedPipeline(p.deals);
  const pipePeriodValue = weighted ? weightedValue(pipePeriod.deals) : pipePeriod.totalValue;
  const pipeYtdValue = weighted ? weightedValue(pipeYtd.deals) : pipeYtd.totalValue;
  const wTag = weighted ? " · weighted" : "";

  const coverage = pipelineCoverage(p.deals, p.granularity, now);
  const coverageOpen = weighted ? weightedValue(open.deals) : coverage.open;
  const coverageRatio = coverage.remaining > 0 ? coverageOpen / coverage.remaining : null;
  const coverageColor =
    coverageRatio === null || coverageRatio >= COVERAGE_TARGET
      ? "text-good"
      : coverageRatio >= COVERAGE_WARN
        ? "text-warn"
        : "text-bad";

  return (
    <div>
      <div className="mb-3 flex justify-end">
        <div role="group" aria-label="Pipeline value basis" className="flex border border-rule-dark">
          {([false, true] as const).map((w) => (
            <button
              key={String(w)}
              type="button"
              aria-pressed={weighted === w}
              onClick={() => setWeighted(w)}
              title={
                w
                  ? "Forecast view: every pipeline $ × its stage win probability"
                  : "Activity view: raw deal values"
              }
              className={`px-3 py-1.5 text-xs font-semibold uppercase tracking-wider transition-colors ${
                weighted === w ? "bg-ink text-paper" : "text-ink-soft hover:bg-paper"
              }`}
            >
              {w ? "Weighted $" : "Raw $"}
            </button>
          ))}
        </div>
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-6">
        <Tile
          label={`Pipeline created · ${phrase}${wTag}`}
          def={DEFINITIONS["rev:pipeline"]}
          foot={`target ${money(periodTarget)} at $200K/mo pace · ${pipePeriod.count} opps`}
        >
          <Metric
            id={`rev:pipeline:${p.period}${weighted ? ":w" : ""}`}
            live={pipePeriodValue}
            format={money}
            onDrill={() =>
              openDrill({
                title: `Pipeline created ${phrase}`,
                subtitle: DEFINITIONS["rev:pipeline"],
                deals: pipePeriod.deals,
                dateOf: (d) => d.entered.sql,
                dateLabel: "Entered SQL",
              })
            }
          />
        </Tile>

        <Tile
          label={`Pipeline created · ${year} YTD${wTag}`}
          def={DEFINITIONS["rev:pipelineYtd"]}
          bar={{ value: pipeYtdValue, target: ytdPaceTarget }}
          foot={`pace target to date ${money(ytdPaceTarget)}`}
        >
          <Metric
            id={`rev:pipelineYtd:${year}${weighted ? ":w" : ""}`}
            live={pipeYtdValue}
            format={money}
            onDrill={() =>
              openDrill({
                title: `Pipeline created ${year} YTD`,
                subtitle: DEFINITIONS["rev:pipelineYtd"],
                deals: pipeYtd.deals,
                dateOf: (d) => d.entered.sql,
                dateLabel: "Entered SQL",
              })
            }
          />
        </Tile>

        <Tile
          label="Weighted Pipeline"
          def={DEFINITIONS["rev:weighted"]}
          foot={
            <>
              <button
                type="button"
                className="underline decoration-rule-dark underline-offset-2 hover:text-accent"
                onClick={() =>
                  openDrill({
                    title: "Open deals — the weighted set",
                    subtitle: DEFINITIONS["rev:weighted"],
                    deals: wpipe.openDeals,
                    dateLabel: "Created",
                  })
                }
              >
                {money(wpipe.rawOpen)} open
              </button>{" "}
              · {money(wpipe.weightedOpen)} weighted
            </>
          }
        >
          <Metric id="rev:weightedPipe" live={wpipe.weightedOpen} format={money} />
        </Tile>

        <Tile
          label={`Closed won · ${year} YTD`}
          def={DEFINITIONS["rev:wonYtd"]}
          bar={{ value: wonYtd.totalValue, target: ARR_TARGET }}
          foot={`${Math.round((wonYtd.totalValue / ARR_TARGET) * 100)}% of ${money(ARR_TARGET)} target · ${wonYtd.count} deals`}
        >
          <Metric
            id={`rev:wonYtd:${year}`}
            live={wonYtd.totalValue}
            format={money}
            onDrill={() =>
              openDrill({
                title: `Closed won ${year} YTD`,
                subtitle: DEFINITIONS["rev:wonYtd"],
                deals: wonYtd.deals,
                dateOf: (d) => d.entered.won,
                dateLabel: "Closed won",
              })
            }
          />
        </Tile>

        <Tile
          label="Projected ARR at close rate"
          def={DEFINITIONS["rev:projArr"]}
          bar={{ value: projected, target: ARR_TARGET }}
          foot={
            <>
              {money(wonYtd.totalValue)} won +{" "}
              <button
                type="button"
                className="underline decoration-rule-dark underline-offset-2 hover:text-accent"
                onClick={() =>
                  openDrill({
                    title: "Open pipeline (entered SQL, still open)",
                    subtitle: DEFINITIONS["rev:openPipeline"],
                    deals: open.deals,
                    dateOf: (d) => d.entered.sql,
                    dateLabel: "Entered SQL",
                  })
                }
              >
                {money(open.totalValue)} open
              </button>{" "}
              × {fmtPct(crResolved)} close
            </>
          }
        >
          <Metric id={`rev:projArr:${year}`} live={projected} format={money} />
        </Tile>

        <Tile
          label={`Pipeline Coverage · Remaining ${coverage.scopeLabel}${wTag}`}
          def={DEFINITIONS["rev:coverage"]}
          foot={
            <>
              <button
                type="button"
                className="underline decoration-rule-dark underline-offset-2 hover:text-accent"
                onClick={() =>
                  openDrill({
                    title: "Open pipeline (entered SQL, still open)",
                    subtitle: DEFINITIONS["rev:openPipeline"],
                    deals: open.deals,
                    dateOf: (d) => d.entered.sql,
                    dateLabel: "Entered SQL",
                  })
                }
              >
                {money(coverageOpen)} open
              </button>{" "}
              ÷ {money(coverage.remaining)} remaining quota · target ≥ {COVERAGE_TARGET.toFixed(1)}x
            </>
          }
        >
          <span className={coverageColor}>
            {coverageRatio === null ? "Met" : `${coverageRatio.toFixed(1)}x`}
          </span>
        </Tile>
      </div>
    </div>
  );
}

/** The bottom line: projected closed-won deals × $50K vs the $1.2M target. */
export function RevenueMath({ deals }: { deals: Deal[] }) {
  const { now } = useDash();
  const year = new Date(now).getFullYear();
  const yearStart = new Date(year, 0, 1).getTime();
  const wonCount = valueEnteredBetween(deals, "won", yearStart, now).count;
  const yearEnd = new Date(year + 1, 0, 1).getTime();
  const elapsed = Math.min(1, Math.max(0.0001, (now - yearStart) / (yearEnd - yearStart)));
  const projectedWins = wonCount / elapsed; // straight-line to Dec 31
  const projectedRevenue = projectedWins * AVG_DEAL_SIZE;
  const pct = projectedRevenue / ARR_TARGET;
  const goalWins = STAGE_GOALS.won.year;
  const status =
    pct >= 1
      ? { chip: "bg-good-soft text-good", label: "on track" }
      : pct >= 0.75
        ? { chip: "bg-warn-soft text-warn", label: "stretch" }
        : { chip: "bg-bad-soft text-bad", label: "behind" };

  return (
    <div className="border border-rule-dark bg-panel px-5 py-4 shadow-card">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <div className="flex items-center gap-2">
          <h3 className="microlabel">Revenue math · {year}</h3>
          <InfoTip text={DEFINITIONS["rev:math"]} label="Revenue math" />
        </div>
        <span className={`px-2 py-1 text-[10px] font-bold uppercase tracking-wider ${status.chip}`}>
          {status.label}
        </span>
      </div>
      <p className="mt-2 font-mono text-sm leading-relaxed">
        <strong className="text-lg font-bold">{wonCount}</strong> closed-won YTD ÷ {Math.round(elapsed * 100)}% of
        year elapsed → <strong className="text-lg font-bold">{(Math.round(projectedWins * 10) / 10).toLocaleString()}</strong>{" "}
        projected by Dec 31 × {fmtMoney(AVG_DEAL_SIZE, { compact: true })} ={" "}
        <strong className={`text-lg font-bold ${pct >= 1 ? "text-good" : "text-bad"}`}>
          {fmtMoney(projectedRevenue, { compact: true })}
        </strong>{" "}
        <span className="text-ink-faint">
          of {fmtMoney(ARR_TARGET, { compact: true })} target ({Math.round(pct * 100)}%) · goal pace is {goalWins}{" "}
          wins/year
        </span>
      </p>
    </div>
  );
}

/** Removable active-filter chip. */
function Pill({ children, onRemove }: { children: React.ReactNode; onRemove: () => void }) {
  return (
    <span className="inline-flex items-center gap-1 border border-rule-dark bg-paper px-2 py-0.5 text-xs text-ink-soft">
      {children}
      <button
        type="button"
        onClick={onRemove}
        aria-label="Remove filter"
        className="text-ink-faint hover:text-bad"
      >
        ✕
      </button>
    </span>
  );
}

function valueRangeLabel(min: number | null, max: number | null): string {
  const m = (n: number) => fmtMoney(n, { compact: true });
  if (min !== null && max !== null) return `${m(min)}–${m(max)}`;
  if (min !== null) return `≥ ${m(min)}`;
  if (max !== null) return `≤ ${m(max)}`;
  return "";
}

const FILTER_CTRL =
  "border border-rule bg-paper px-2 py-1 text-xs text-ink hover:border-rule-dark focus:border-accent focus:outline-none";

interface OpenDealsProps {
  deals: Deal[];
  /** Assignable sourcing names (roster ∪ names already on deals). */
  sdrs: string[];
  /** Writes through to HubSpot's sourcing_sdr property. */
  onAssignSdr: (dealId: string, sdr: string | null) => void;
}

export function OpenDeals({ deals, sdrs, onAssignSdr }: OpenDealsProps) {
  const { now } = useDash();

  const open = useMemo(() => deals.filter((d) => d.isOpen), [deals]);
  const stageOptions = useMemo(
    () => Array.from(new Set(open.map((d) => d.stageLabel))).sort(),
    [open]
  );

  // UI chrome — all local state.
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("age");
  const [sortDir, setSortDir] = useState<SortDir>("desc"); // stalest first
  const [stages, setStages] = useState<Set<string> | null>(null); // null = all
  const [valueMin, setValueMin] = useState<number | null>(null);
  const [valueMax, setValueMax] = useState<number | null>(null);
  const [ageBuckets, setAgeBuckets] = useState<Set<string>>(new Set());
  const [showAll, setShowAll] = useState(false);
  const [selected, setSelected] = useState<Deal | null>(null);

  const stagePop = usePop();

  // Expand/collapse animates the table wrapper's height. `height: auto` isn't
  // animatable, so: pin the current px height on click, let React render the
  // new row set, then transition from the pinned height to the measured target.
  const tableWrapRef = useRef<HTMLDivElement>(null);
  const animatingRef = useRef(false);

  const toggleShowAll = () => {
    const el = tableWrapRef.current;
    if (el) {
      el.style.height = `${el.scrollHeight}px`;
      animatingRef.current = true;
    }
    setShowAll((v) => !v);
  };

  useLayoutEffect(() => {
    const el = tableWrapRef.current;
    if (!el || !animatingRef.current) return;
    animatingRef.current = false;
    const start = el.style.height; // pinned at click time
    el.style.transition = "none";
    el.style.height = "auto";
    const target = el.scrollHeight; // post-render natural height
    el.style.height = start;
    void el.offsetHeight; // commit the start height before transitioning
    el.style.transition = "height 300ms ease-out";
    el.style.height = `${target}px`;
    const done = () => {
      el.style.transition = "";
      el.style.height = ""; // back to auto so filters/resize reflow freely
    };
    const fallback = setTimeout(done, 340);
    const onEnd = (e: TransitionEvent) => {
      if (e.propertyName === "height") {
        clearTimeout(fallback);
        done();
      }
    };
    el.addEventListener("transitionend", onEnd);
    return () => {
      clearTimeout(fallback);
      el.removeEventListener("transitionend", onEnd);
    };
  }, [showAll]);

  // 150ms debounce on the search box.
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 150);
    return () => clearTimeout(t);
  }, [search]);

  const effectiveStages = useMemo(() => stages ?? new Set(stageOptions), [stages, stageOptions]);
  const stagesAreAll = stageOptions.every((s) => effectiveStages.has(s)) && effectiveStages.size === stageOptions.length;

  const filtered = useMemo(
    () =>
      filterOpenDeals(
        open,
        { search: debouncedSearch, stages: effectiveStages, valueMin, valueMax, ageBuckets },
        now
      ),
    [open, debouncedSearch, effectiveStages, valueMin, valueMax, ageBuckets, now]
  );
  const sorted = useMemo(
    () => sortOpenDeals(filtered, sortKey, sortDir, now),
    [filtered, sortKey, sortDir, now]
  );
  const visible = showAll ? sorted : sorted.slice(0, 12);
  const filteredValue = filtered.reduce((s, d) => s + d.value, 0);

  const valueActive = valueMin !== null || valueMax !== null;
  const anyFilter = search.trim() !== "" || !stagesAreAll || valueActive || ageBuckets.size > 0;

  const canExpand = filtered.length > 12;
  const toggleLabel =
    showAll && canExpand
      ? "Show top 12"
      : anyFilter
        ? `Show all matching (${filtered.length})`
        : `Show all (${filtered.length})`;

  const onSort = (key: SortKey) => {
    if (sortKey === key) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortKey(key);
      setSortDir(DEFAULT_SORT_DIR[key]);
    }
  };

  const toggleStage = (label: string) =>
    setStages((prev) => {
      const next = new Set(prev ?? stageOptions);
      if (next.has(label)) next.delete(label);
      else next.add(label);
      return next;
    });
  const removeStage = (label: string) =>
    setStages((prev) => {
      const next = new Set(prev ?? stageOptions);
      next.delete(label);
      return next;
    });

  const toggleAge = (key: string) =>
    setAgeBuckets((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  const valueChipActive = (min: number | null, max: number | null) => valueMin === min && valueMax === max;
  const onValueChip = (min: number | null, max: number | null) => {
    if (valueChipActive(min, max)) {
      setValueMin(null);
      setValueMax(null);
    } else {
      setValueMin(min);
      setValueMax(max);
    }
  };
  const parseMoney = (raw: string): number | null => {
    if (raw.trim() === "") return null;
    const n = Number(raw);
    return Number.isFinite(n) ? n : null;
  };

  const clearFilters = () => {
    setSearch("");
    setDebouncedSearch("");
    setStages(null);
    setValueMin(null);
    setValueMax(null);
    setAgeBuckets(new Set());
  };

  // Sortable column header.
  const SortTh = ({ label, k, className = "" }: { label: string; k: SortKey; className?: string }) => {
    const active = sortKey === k;
    return (
      <th className={`py-2 ${className}`}>
        <button
          type="button"
          onClick={() => onSort(k)}
          aria-label={`Sort by ${label}`}
          className={`microlabel inline-flex items-center gap-1 font-semibold transition-colors hover:text-accent ${active ? "text-ink" : ""}`}
        >
          {label}
          {active && <span aria-hidden>{sortDir === "asc" ? "▲" : "▼"}</span>}
        </button>
      </th>
    );
  };

  return (
    <div className="border border-rule bg-panel shadow-card">
      {/* toolbar: search + result count */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-rule px-5 py-3">
        <div className="relative min-w-[14rem] flex-1">
          <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-faint">
            <svg viewBox="0 0 16 16" className="size-3.5" fill="none" stroke="currentColor" strokeWidth="1.6">
              <circle cx="7" cy="7" r="4.5" />
              <path d="M10.5 10.5 14 14" strokeLinecap="round" />
            </svg>
          </span>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search deals…"
            aria-label="Search open deals by name"
            className="w-full border border-rule bg-paper py-1.5 pl-8 pr-8 text-sm text-ink placeholder:text-ink-faint focus:border-accent focus:outline-none"
          />
          {search && (
            <button
              type="button"
              onClick={() => setSearch("")}
              aria-label="Clear search"
              className="absolute right-2 top-1/2 -translate-y-1/2 text-ink-faint hover:text-ink"
            >
              ✕
            </button>
          )}
        </div>
        <div className="flex items-center gap-3">
          <p className="font-mono text-[11px] text-ink-faint">
            Showing {filtered.length} of {open.length} deals · {fmtMoney(filteredValue, { compact: true })}
          </p>
          <button
            type="button"
            onClick={toggleShowAll}
            disabled={!canExpand}
            aria-expanded={showAll && canExpand}
            className="whitespace-nowrap rounded border border-rule-dark px-3 py-1.5 text-xs font-medium text-ink-soft transition-colors hover:border-accent hover:text-accent disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:border-rule-dark disabled:hover:text-ink-soft"
          >
            {toggleLabel}
            <span aria-hidden className="ml-1.5 text-[9px]">
              {showAll && canExpand ? "▲" : "▼"}
            </span>
          </button>
        </div>
      </div>

      {/* filter bar: stage · value · age — stacks on mobile, single row from sm up */}
      <div className="flex flex-col gap-3 border-b border-rule px-5 py-3 sm:flex-row sm:flex-wrap sm:items-center sm:gap-x-4 sm:gap-y-2">
        {/* stage multi-select */}
        <span ref={stagePop.ref} className="relative inline-block">
          <button
            type="button"
            aria-expanded={stagePop.open}
            onClick={() => stagePop.setOpen(!stagePop.open)}
            className={`${FILTER_CTRL} inline-flex items-center gap-1.5`}
          >
            Stage
            {!stagesAreAll && (
              <span className="bg-accent-soft px-1 font-mono text-[10px] text-accent">{effectiveStages.size}</span>
            )}
            <span aria-hidden className="text-ink-faint">▾</span>
          </button>
          {stagePop.open && (
            <span className="absolute left-0 top-full z-40 mt-1 block w-52 border border-rule-dark bg-panel p-2 shadow-pop">
              {stageOptions.map((label) => (
                <label
                  key={label}
                  className="flex cursor-pointer items-center gap-2 px-1 py-1 text-xs text-ink-soft hover:text-ink"
                >
                  <input
                    type="checkbox"
                    checked={effectiveStages.has(label)}
                    onChange={() => toggleStage(label)}
                    className="accent-accent"
                  />
                  {label}
                </label>
              ))}
            </span>
          )}
        </span>

        {/* value range */}
        <span className="flex flex-wrap items-center gap-1.5">
          <span className="microlabel">Value</span>
          <input
            type="number"
            inputMode="numeric"
            value={valueMin ?? ""}
            onChange={(e) => setValueMin(parseMoney(e.target.value))}
            placeholder="Min"
            aria-label="Minimum deal value"
            className={`${FILTER_CTRL} w-20 font-mono`}
          />
          <span className="text-ink-faint">–</span>
          <input
            type="number"
            inputMode="numeric"
            value={valueMax ?? ""}
            onChange={(e) => setValueMax(parseMoney(e.target.value))}
            placeholder="Max"
            aria-label="Maximum deal value"
            className={`${FILTER_CTRL} w-20 font-mono`}
          />
          {VALUE_CHIPS.map((c) => (
            <button
              key={c.key}
              type="button"
              onClick={() => onValueChip(c.min, c.max)}
              aria-pressed={valueChipActive(c.min, c.max)}
              className={`border px-2 py-1 text-xs transition-colors ${
                valueChipActive(c.min, c.max)
                  ? "border-accent bg-accent-soft text-accent"
                  : "border-rule bg-paper text-ink-soft hover:border-rule-dark"
              }`}
            >
              {c.label}
            </button>
          ))}
        </span>

        {/* age buckets */}
        <span className="flex flex-wrap items-center gap-1.5">
          <span className="microlabel">Age</span>
          {AGE_BUCKETS.map((b) => {
            const on = ageBuckets.has(b.key);
            return (
              <button
                key={b.key}
                type="button"
                onClick={() => toggleAge(b.key)}
                aria-pressed={on}
                className={`border px-2 py-1 text-xs transition-colors ${
                  on
                    ? "border-accent bg-accent-soft text-accent"
                    : "border-rule bg-paper text-ink-soft hover:border-rule-dark"
                }`}
              >
                {b.label}
              </button>
            );
          })}
        </span>
      </div>

      {/* active filter pills */}
      {anyFilter && (
        <div className="flex flex-wrap items-center gap-2 border-b border-rule px-5 py-2.5">
          {!stagesAreAll &&
            [...effectiveStages].map((label) => (
              <Pill key={`stage-${label}`} onRemove={() => removeStage(label)}>
                <span className="text-ink-faint">stage:</span> {label}
              </Pill>
            ))}
          {valueActive && (
            <Pill
              onRemove={() => {
                setValueMin(null);
                setValueMax(null);
              }}
            >
              <span className="text-ink-faint">value:</span> {valueRangeLabel(valueMin, valueMax)}
            </Pill>
          )}
          {AGE_BUCKETS.filter((b) => ageBuckets.has(b.key)).map((b) => (
            <Pill key={`age-${b.key}`} onRemove={() => toggleAge(b.key)}>
              <span className="text-ink-faint">age:</span> {b.label}
            </Pill>
          ))}
          <button
            type="button"
            onClick={clearFilters}
            className="ml-auto text-xs font-semibold text-accent hover:underline"
          >
            Clear all
          </button>
        </div>
      )}

      <div ref={tableWrapRef} className="overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[46rem] text-sm">
          <thead>
            <tr className="border-b border-rule text-left">
              <SortTh label="Deal" k="name" className="px-5" />
              <SortTh label="Stage now" k="stage" className="px-3" />
              <SortTh label="Status" k="status" className="px-3" />
              <th className="px-3 py-2 text-right">
                <button
                  type="button"
                  onClick={() => onSort("value")}
                  aria-label="Sort by Value"
                  className={`microlabel inline-flex items-center gap-1 font-semibold transition-colors hover:text-accent ${sortKey === "value" ? "text-ink" : ""}`}
                >
                  Value
                  {sortKey === "value" && <span aria-hidden>{sortDir === "asc" ? "▲" : "▼"}</span>}
                </button>
              </th>
              <SortTh label="Created" k="created" className="px-3" />
              <SortTh label="Age" k="age" className="px-3" />
              <th className="microlabel px-3 py-2 font-semibold" title="Sourcing SDR — assigned here, not in HubSpot">
                SDR
              </th>
              <th className="px-5 py-2" />
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-5 py-12 text-center">
                  <p className="text-sm text-ink-soft">No deals match these filters</p>
                  <button
                    type="button"
                    onClick={clearFilters}
                    className="mt-3 border border-rule px-3 py-1.5 text-xs font-semibold text-accent hover:bg-paper"
                  >
                    Clear filters
                  </button>
                </td>
              </tr>
            ) : (
              visible.map((d) => (
                <tr
                  key={d.id}
                  onClick={() => setSelected(d)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      setSelected(d);
                    }
                  }}
                  tabIndex={0}
                  role="button"
                  aria-label={`View ${d.name}`}
                  className="cursor-pointer border-b border-rule/60 last:border-0 hover:bg-paper focus-visible:bg-paper focus-visible:outline-none"
                >
                  <td className="max-w-[18rem] truncate px-5 py-2 font-medium">{d.name}</td>
                  <td className="whitespace-nowrap px-3 py-2 text-xs text-ink-soft">{d.stageLabel}</td>
                  <td className="whitespace-nowrap px-3 py-2">
                    <StaleBadge staleness={dealStaleness(d, now)} />
                  </td>
                  <td className="whitespace-nowrap px-3 py-2 text-right font-mono text-xs">
                    {fmtMoney(d.value, { compact: true })}
                    {d.amount === null && (
                      <span className="ml-1 text-[9px] uppercase text-ink-faint" title="No amount set — $50K default">
                        est
                      </span>
                    )}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2 font-mono text-xs text-ink-soft">{fmtDate(d.createdAt)}</td>
                  <td className="whitespace-nowrap px-3 py-2 font-mono text-xs text-ink-soft">{daysAgo(d.createdAt, now)}</td>
                  <td className="whitespace-nowrap px-3 py-2" onClick={(e) => e.stopPropagation()}>
                    <span className="inline-flex items-center gap-1.5">
                      {d.sdr && <Avatar name={d.sdr} />}
                      <select
                        value={d.sdr ?? ""}
                        onChange={(e) => onAssignSdr(d.id, e.target.value || null)}
                        onKeyDown={(e) => e.stopPropagation()}
                        aria-label={`Sourcing SDR for ${d.name}`}
                        title="Who sourced this deal — assigned here, not in HubSpot"
                        className={
                          d.sdr
                            ? "border border-transparent bg-transparent px-1 py-1 text-xs text-ink-soft hover:border-rule focus:border-accent focus:outline-none"
                            : "border border-dashed border-rule-dark bg-transparent px-1.5 py-1 text-xs text-ink-faint hover:border-accent hover:text-accent focus:border-accent focus:outline-none"
                        }
                      >
                        <option value="">+ SDR</option>
                        {sdrs.map((s) => (
                          <option key={s} value={s}>
                            {s}
                          </option>
                        ))}
                      </select>
                    </span>
                  </td>
                  <td className="whitespace-nowrap px-5 py-2 text-right">
                    <a
                      href={d.hubspotUrl}
                      target="_blank"
                      rel="noreferrer"
                      onClick={(e) => e.stopPropagation()}
                      className="font-mono text-xs text-accent underline decoration-accent/40 underline-offset-2 hover:decoration-accent"
                    >
                      HubSpot ↗
                    </a>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      </div>

      {selected &&
        (() => {
          // re-resolve from the live array so an assignment made in the drawer
          // (or any sync) reflects immediately
          const live = deals.find((d) => d.id === selected.id) ?? selected;
          return (
            <OpenDealDrawer
              deal={live}
              sdrs={sdrs}
              sdr={live.sdr ?? null}
              onAssignSdr={(s) => onAssignSdr(live.id, s)}
              onClose={() => setSelected(null)}
            />
          );
        })()}
    </div>
  );
}
