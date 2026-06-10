# Lessons learned on this codebase

Append-only log. Each entry: date · what I tried · what went wrong ·
what to do next time. Read this file before starting any new task.

## Entries

### 2026-06-10 · Pacing badges (feat/pacing-badges)

- **Touched**: `src/lib/metrics.ts` (new `pacingBadge()`), `src/components/Metric.tsx`
  (`RiskBadge` → `PaceBadge`), `src/components/Scoreboard.tsx`, `src/components/Header.tsx`
  (How-to-Read), `src/app/globals.css` (new `ahead` purple tokens), `src/middleware.ts`
  (dev-only auth bypass for screenshots).
- **Surprises**: (1) An MCP server added mid-session (`claude mcp add playwright`) is NOT
  available to that same session — its tools only load on the next session. Fell back to
  the `playwright` npm library directly (now a devDependency), which works fine for
  screenshots. (2) The How-to-Read modal's chip column was hardcoded to 3.5rem — wider
  chips like SLIGHTLY BEHIND need 5.75rem. (3) Wide chips next to long card titles
  ("SQL · NET NEW OPPS") wrapped one-word-per-line; `flex-wrap` on the card header row
  fixes it by dropping the chip below the title.
- **Tip for future-you**: the app is auth-gated, so headless screenshots need
  `DEV_NO_AUTH=1 PORT=3100 npm run dev` (dev-only bypass in middleware.ts, double-gated by
  NODE_ENV). Reuse /tmp-style scripts against port 3100, and remember `fmtNum()` already
  formats fractional goals to one decimal — don't reinvent.

### 2026-06-10 · Pace-to-Goal bar redesign (main)

- **Touched**: `src/components/Pace.tsx` (28px bar, 4-state fill via `pacingBadge()`,
  marker labels, hover tooltip, removed the redundant stats row), `src/lib/periods.ts`
  (new `dayOfPeriod()`), `src/components/Metric.tsx` (exported `POP_PANEL`; `PaceBadge`
  now reused as the card chip so chip and fill can't disagree).
- **Surprises**: (1) `scripts/dev-check.sh` boots its own dev server on port 3000 that
  shares `.next` with a long-running port-3100 server — it clobbers compiled route
  artifacts and the 3100 server starts 500ing (`ENOENT .next/server/app/api/...`).
  Restart the 3100 server after running dev-check. (2) The `.rise` sections create their
  own stacking contexts, so a popover that opens *downward* out of one section gets
  painted over by the next section's heading regardless of z-index — open popovers
  upward, over their own card. (3) Marker labels clamped away from their marker lose the
  visual association; right-anchoring the label to the marker once it passes ~55% reads
  much better than a symmetric clamp.
- **Tip for future-you**: the bar's "Expected today" label hides the "Goal" label when
  the expected marker passes 82% of the track — they'd collide at end of period and say
  nearly the same number anyway.

### 2026-06-10 · Section rhythm + scroll-aware nav indicator (main)

- **Touched**: `Dashboard.tsx` (new `Section` wrapper, IntersectionObserver scrollspy),
  `Header.tsx` (sticky from `md:` up, section indicator next to the period nav),
  `Revenue.tsx` (split into `Revenue` / `OpenDeals` / `RevenueMath` exports so all seven
  sections are top-level), `Scoreboard/FunnelTrend/Pace/Funnel` (own `<h2>` rows removed —
  the wrapper owns the `<section>`).
- **Surprises**: (1) A pure thin-band scrollspy can never activate the *last* section —
  a short tail section's header physically can't scroll up to the band; a second
  IntersectionObserver on the footer (threshold ≈ 1) as an end-of-page sentinel fixes it
  without scroll listeners. (2) `rootMargin` percentages are relative to viewport height —
  on a 390px-tall... wide phone the math went negative; compute the bottom margin in px
  from `window.innerHeight` and the *measured* header height instead. (3) A sticky header
  that wraps to ~240px on mobile eats a quarter of the viewport — `md:sticky` only.
  (4) JSX comments (`{/* */}`) are invalid directly inside `return (` before the root
  element — use a `//` line comment there.
- **Tip for future-you**: the scrollspy band sits just under the nav
  (`-navH px` top margin); sections report via a `hit` map and "last intersecting in DOM
  order" wins; in the 40px gaps between sections it deliberately keeps the previous name.

### 2026-06-10 · Open Deals table sort/filter/search/drawer (main)

- **Touched**: new `src/lib/openDeals.ts` (pure `filterOpenDeals`/`sortOpenDeals`,
  `ageDays`, `AGE_BUCKETS`, `VALUE_CHIPS`, `DEFAULT_SORT_DIR`), new
  `src/components/OpenDealDrawer.tsx` (right-side detail drawer), `Revenue.tsx` (rewrote the
  `OpenDeals` export: debounced search, sortable headers, stage/value/age filter bar with
  removable pills, "Showing N of M" count, empty state, row→drawer), `Metric.tsx` (exported
  the previously-private `usePop` hook to reuse for the stage dropdown).
- **Decisions** (owner confirmed, 2026-06-10): the data-layer / HubSpot guardrail is **hard**
  and wins over completeness. The drawer's owner / last-activity / next-step fields don't exist
  on `Deal`, so they render a graceful **"Not available"** placeholder — no fetching/plumbing
  added (clean seam for a later associations/owners-API follow-up). Search matches deal name
  only (no separate account field; the account is embedded in the name). Ordering is
  search+filter+sort **then** the top-12 cap, default sort AGE desc. Live portal has exactly
  **52 open deals** and real "Robinhood …" records, so the search test hit real data.
- **Surprises**: (1) Hit the documented `.rise` stacking-context trap again — the drawer was
  rendered *inside* the `.rise` `<Section>`, so its `z-50` was scoped within the section and
  the sticky header (`z-30`, top level) painted over the drawer's top (deal name + close
  button were hidden). `Drilldown` dodges this by rendering at the top level of `Dashboard`.
  Fix: `createPortal(panel, document.body)` so the overlay escapes any ancestor stacking
  context (React context still flows through portals, so `useDash()` keeps working). For any
  *new* overlay nested inside a section, portal to body — don't fight z-index. (2) `createPortal`
  threw `Target container is not a DOM element` exactly once, and the stack was entirely inside
  React Fast Refresh (`performReactRefresh`/`applyUpdate`) — an HMR-only artifact from editing
  the file while the drawer was mounted. The standard `const [mounted,setMounted]=useState(false);
  useEffect(()=>setMounted(true),[]); if(!mounted) return null;` guard before the portal kills it.
  (3) Filter-bar control groups built as `inline-flex` (Value: label+Min+Max+3 chips) don't wrap
  and blew past 390px → whole-page horizontal scroll. Make the bar `flex-col … sm:flex-row
  sm:flex-wrap` and each group `flex flex-wrap` so chips drop to a second line on mobile;
  desktop is unchanged. The table itself keeps `min-w-[36rem]` inside `overflow-x-auto` — that
  horizontal scroll is intentional and contained, not page overflow.
- **Tip for future-you**: `usePop`'s ref is typed `HTMLSpanElement`, so the dropdown wrapper
  must be a `<span className="relative inline-block">` (like `InfoTip`), not a `<div>`.
  `format.ts` `daysAgo()` returns a *string* ("840 days") — for buckets/sorting use the new
  numeric `ageDays()` in `openDeals.ts`. The stage filter treats "every present stage selected"
  as no-op (not set-size), so it's robust to stale labels; `null` state = "all".

### 2026-06-10 · Close rate empty-state clarity (main)

- **Touched**: `Metric.tsx` (new shared `EMPTY_TRACK` style const, precedent `POP_PANEL`),
  `Funnel.tsx` (close-rate card: null-rate headline message + empty-bar variant with overlay
  text), `Revenue.tsx` (`Tile` bar at $0), `Pace.tsx` (bar at actual 0).
- **Decisions**: the app has exactly **3** progress-fill bars (grep `width:` styles) — close
  rate, Revenue tiles, Pace cards; Recharts charts are data charts, not gauges, and were
  deliberately excluded from the empty-state treatment. The requested ⓘ tooltip already
  existed (`DEFINITIONS.closeRate` wired at the card header) — no change. `closeRate()`
  already separates the two empty cases: `rate 0` (losses, no wins) vs `rate null` (nothing
  closed). The headline only becomes the "No closed deals…" message when the *resolved*
  (override-aware) value is null, so a manual close-rate override still renders normally.
- **Surprises**: (1) The live portal data exactly matched the spec's example — 0 won / 2
  lost in the trailing 90 days → "0 won of 2 attempted". Real data covered the 0% case; the
  null case can't occur live, so it was verified by temporarily forcing
  `Object.assign(cr, {rate:null,…})` in the component, screenshotting, and reverting before
  commit (screenshot kept as `close-rate-after-empty-90d.png`). (2) A natural Pace zero
  exists at **week** granularity (NNO 0/1.4) — switch granularity before hunting for forced
  states. (3) Overlay text inside an empty track needs `bg-panel px-1.5` on the label so the
  50% target marker doesn't strike through it; keep the marker `-top-1 -bottom-1` so it
  still reads as crossing the full track.
- **Tip for future-you**: any new progress bar should use `EMPTY_TRACK` for its zero state
  (dashed faint outline = deliberately empty, not broken). The close-rate empty bar is `h-6`
  (vs `h-3` filled) specifically to host the overlay text — states swap rarely, so the
  height jump is a non-issue.

### 2026-06-10 · Show-all toggle as a real button (main)

- **Touched**: `Revenue.tsx` only (`OpenDeals`): bottom full-width text toggle deleted;
  secondary button (bordered, `rounded`, ▼/▲ chevron, `aria-expanded`) added in the toolbar
  next to the result count; measure-and-transition height animation on a new
  `overflow-hidden` wrapper around the table's `overflow-x-auto` div.
- **Decisions**: `rounded` corners are a spec-requested deviation from the app's otherwise
  square ledger aesthetic. Labels: "Show all (52)" / "Show top 12" / filtered →
  "Show all matching (N)", disabled (40% opacity) when N ≤ 12.
- **Surprises**: (1) `height: auto` isn't animatable — the reliable recipe is: pin current
  `scrollHeight` px in the click handler *before* flipping state, then in a
  `useLayoutEffect` keyed on the state set `height:auto` → measure target → restore pinned
  height → force reflow (`void el.offsetHeight`) → set `transition: height 300ms ease-out` +
  target px → clear both to auto on `transitionend` with a ~340ms setTimeout fallback
  (transitionend doesn't fire if the tab is backgrounded). Gate the effect on an
  `animatingRef` so filter-driven height changes don't animate. (2) Setting a
  React-controlled input's value from page JS needs the native setter
  (`Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(...)` +
  `dispatchEvent(new Event('input',{bubbles:true}))`) — assigning `.value` directly is
  swallowed by React. (3) `prefers-reduced-motion` needed zero extra work — globals.css
  already neutralizes all transitions globally.
- **Tip for future-you**: the disabled state needs explicit `disabled:hover:*` resets,
  otherwise the hover accent still fires on a disabled button (pointer events aren't off).

### 2026-06-10 · Sync loading skeletons (main)

- **Touched**: new `Skeleton.tsx` (`SkeletonOverlay`, 5 shape kinds), `globals.css`
  (`shimmer` keyframes/class), `Dashboard.tsx` (`Section` gains loading/skeleton/error/
  onRetry; `load()` split into independent deals/store chains; `fatal` replaced by
  `syncError` — banner only when no payload, per-section chips otherwise), `Header.tsx`
  (spinner in disabled REFRESH, 1.2s green flash on `fetchedAt` change).
- **Decisions (single-query interpretation, noted for the owner)**: all 7 sections derive
  from ONE `/api/deals` payload — "progressive per-section rendering" was implemented as
  per-data-source (deals and store each apply the moment they land; the old `Promise.all`
  gated both). No artificial stagger to fake latency; no per-section API split (data-layer
  guardrail). Failure chips render in every section header because the one sync feeds all
  of them. Skeletons are refresh-only; first load keeps the full-page state.
- **Surprises**: (1) Capturing a mid-sync screenshot needs the in-flight window to outlast
  Playwright-MCP tool latency (~10-25s per screenshot+inspect round trip) — an 8s in-page
  fetch delay was eaten before the screenshot landed; 30s+ worked. Patch
  `window.fetch` in-page (delay or synthetic 500 `Response`) — runtime-only, survives
  zero reloads, no code changes. (2) The dev tab wedged once at the pre-mount "loading
  scoreboard…" state after many HMR full reloads + fetch patches (no console error, server
  healthy) — a hard navigation fixed it; it's a dev-mode artifact, not app code, but don't
  burn time debugging the app when the dev log shows clean compiles. (3) Synthetic-500
  failures resolve in microtasks, so "is the button in Syncing state" sampled at 150ms
  misses the whole flight — verify instant-failure paths by counting intercepted calls or
  by their effects (chips), not by timing. (4) React state updates inside split promise
  chains: clear the skeleton flag in the deals chain's `finally`, clear the button flag
  after `Promise.allSettled` — two different lifetimes, two flags (`syncing` vs
  `refreshing`).
- **Tip for future-you**: the skeleton overlay is `bg-paper/90`, so stale content ghosts
  through at 10% — deliberate (shows the page isn't blank). `Section`'s error chip carries
  the real error message in `title`; the visible text stays the calm fixed copy.

### 2026-06-10 · Today's Focus prescriptive panel (main)

- **Touched**: new `src/lib/todayFocus.ts` (pure scoring: 5 category generators,
  normalized 0–100 severity, `computeFocusActions`/`topFocusActions`), new
  `src/lib/todayFocus.test.ts` (**first unit tests in the repo** — vitest as devDependency,
  `npm run test`, zero config because the whole lib chain uses relative imports), new
  `src/components/TodayFocus.tsx` (hero panel), one insertion in `Dashboard.tsx`.
- **Decisions**: staleness proxy = days since `max(entered.*)` (no stage-history /
  last-activity on `Deal`; data layer untouched) — yields 835 days for Robinhood, matching
  the brief's example. One card per category, categories ranked by normalized severity
  (three different levers beat three copies of one). Pacing anchors to the *current month*
  regardless of the viewer's selected period. CTAs: HubSpot record links + `#section:<name>`
  smooth-scroll (no URL-driven filter state exists for "filtered table view" deep links).
  `deals.length === 0` → no actions (empty data ≠ everything urgent). Dismissals:
  `localStorage` `{date, ids}` keyed to the local day; filtering lives in the pure lib so
  the next-ranked candidate fills a dismissed slot.
- **Surprises**: (1) The panel ranked PACING **Deep Dive 0/5** above SAL 6/31 — correct
  (worst offender within category wins) but not what the brief's example predicted;
  severity math beats intuition, trust it. (2) `⟳` (U+27F3) renders as near-tofu in Work
  Sans buttons; `↻`/`↺` (U+21BB/BA) render fine — the app already used ↺. (3) The
  long-lived dev server (6h of HMR + two dev-check runs) eventually 500'd every RSC
  prefetch with `Invariant: Expected clientReferenceManifest to be defined` — looks like an
  app bug, is actually corrupted `.next` dev state; restart the server before debugging
  anything (LESSONS pattern #3, now confirmed twice). (4) Vitest picks up `*.test.ts`
  inside `src/` with zero config; explicit `import { describe... } from "vitest"` also
  keeps `tsc --noEmit` happy without a types entry.
- **Tip for future-you**: the scoring lib is deliberately UI-free so an email digest can
  reuse `computeFocusActions` server-side. Score scales: stale saturates at $50K×365days;
  pacing/conversion are shortfall ratios ×100; revival is value/$100K (+20% if lost ≤30d);
  goal milestones are ×0.6-weighted (momentum, not urgency). Tune there, not in the JSX.

### 2026-06-10 · Headline KPIs (main)

- **Touched**: new `src/lib/headline.ts` (`headlineWindows`, interpolating `quantile`,
  `headlineKpis` — windowed win rate / cycle median+P25–P75 / deal-size mean+median, each
  with a prior-window value), new `src/lib/headline.test.ts` (7 tests), new
  `src/components/Headline.tsx` (three tiles mirroring StageCard anatomy), one `Section`
  insert in `Dashboard.tsx` between Today's Focus and Stage Entries (standard
  loading/error wiring → sync skeletons and failure chips came free; scrollspy registered
  automatically via `data-section`).
- **Decisions**: T12M windows use calendar-month arithmetic (`new Date(y, m−12, d)`), not
  365×day. YEAR view compares YTD to the *same span* of the prior year (Jan 1 → same
  date), not the full prior year. Cycle delta colors are inverted (shorter = green).
  Win-rate delta is in percentage points. Every tooltip embeds the literal date range.
- **Surprises**: (1) Live T12M data is brutal and exercised every empty path naturally:
  0 won · 26 lost → 0% win rate, cycle "N/A — needs a first closed-won", deal size "—".
  The designed empty states were the *primary* states, not edge cases — worth designing
  them first on this portal. (2) Prior-window (Jun 2024–Jun 2025) has zero closes, so all
  deltas read "— vs prior" — `hs_v2_date_entered_closedlost` coverage evidently starts
  later than deal history. (3) `data-section^="Headline"` prefix selectors keep Playwright
  checks stable while the title swaps between "Trailing 12 Months" and "2026 YTD".
- **Tip for future-you**: `headlineKpis` is window-agnostic — feed it any `{start,end}`
  pair (quarterly board reviews, cohort comparisons) without touching the math.
