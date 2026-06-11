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

### 2026-06-10 · Headline moved above Revenue Math (main)

- **Touched**: `Dashboard.tsx` only — the Headline `Section` relocated from
  Today's-Focus-adjacent to between Open Deals and Revenue Math (owner call: with no
  recent wins, a 0%-win-rate banner shouldn't be the second thing on the page).
- **Surprises**: mid-verification the live portal changed under us — open deals dropped
  52 → 28 and closed-lost jumped to 26 in the window. Someone executed the stale-deal
  cleanup that Today's Focus prescribed hours earlier (the 800+-day On Hold block got
  closed out). If a count looks "wrong" vs an earlier screenshot, check whether the data
  moved before hunting a bug — this portal is live and now demonstrably acted upon.
- **Tip for future-you**: section entrance delays are 0–360ms in 60ms steps; a relocated
  section should take a delay matching its new slot (Headline now 330, between Open
  Deals' 300 and Revenue Math's 360).

### 2026-06-10 · Pipeline coverage tile (main)

- **Touched**: `metrics.ts` (new `pipelineCoverage()` — quarter view divides against the
  quarter's $300K slice with won-this-quarter, everything else against the $1.2M annual
  with won-YTD; `ratio: null` = quota met), `config.ts` (`COVERAGE_TARGET`/`COVERAGE_WARN`
  + `DEFINITIONS["rev:coverage"]` — only the goals/display zone, no guarded constants),
  new `metrics.test.ts` (4 tests), `Revenue.tsx` (grid `xl:grid-cols-4`→`-5`, fifth Tile,
  threshold-colored value via signal tokens, "$X open" foot drills to the open-pipeline
  deals reusing the Projected-ARR foot pattern).
- **Surprises**: (1) The brief's example numbers ($719K open, 0.6x) were captured before
  today's portal cleanup — live is $384K open → 0.3x. When a spec quotes concrete numbers
  from a live system, expect drift between writing and shipping. (2) The wedged dev-tab
  state recurred twice during verification; an in-page `location.href = url + ?r=<rand>`
  recovers it faster than the navigate tool (which can race its own evaluate context).
- **Tip for future-you**: `pipelineCoverage` deliberately ignores the week/month period —
  remaining-quota math only changes shape at quarter/year boundaries; a "remaining month"
  coverage ratio would be noise.

### 2026-06-10 · Stale deal flags + needs-attention section (main)

- **Touched**: new `src/lib/stale.ts` (shared staleness: `dealStaleness`/`staleDeals`/
  `severityRank` — the days-in-stage fallback chain is documented in its header comment),
  `config.ts` (`STALE_THRESHOLDS` 30/45/60/90 + 90d default + 180d On-Hold gate +
  label→key regex matchers), new `stale.test.ts` (5 tests), `todayFocus.ts`
  (`staleCandidate` now consumes `staleDeals()` — one definition across hero/section/
  table; existing tests passed unmodified), `openDeals.ts` (+`status` SortKey, severity
  then days), `Metric.tsx` (shared `StaleBadge` dot+label chip), `Revenue.tsx` (STATUS
  column, `colSpan` 6→7, table `min-w` 36→42rem), new `StaleDeals.tsx` + Dashboard
  section above Open Deals.
- **Surprises**: (1) The portal keeps moving *today*: Closed Lost hit 24 this month and
  Today's Focus flipped its top card to REVIVAL — "Robinhood … closed lost **0 days
  ago**" — i.e., the panel is now prescribing follow-up on the action it prescribed this
  morning. Live verification doubles as a product demo. (2) The one stale deal
  (Inriver/Pola, SQL 50d) scored 13.7 and correctly did NOT crack the Focus top 3 —
  "wired into scoring" ≠ "always visible"; check the ranked list, not just the panel.
  (3) TS2783 (key specified twice) fires when a factory sets a field explicitly *and*
  spreads an `over` object that's required to contain it — let the spread own required
  fields. (4) A `flex-1 min-w-0 truncate` name next to several `whitespace-nowrap`
  siblings collapses to ~10px at 390px — `w-full sm:w-auto sm:flex-1` gives it its own
  mobile line.
- **Tip for future-you**: staleness thresholds and the stage-label regexes live entirely
  in config — when the portal renames stages, fix the matcher there, not the lib. The
  STATUS sort ranks stale(3) > on-hold(2) > aging(1) > fresh(0), days-in-stage as
  tiebreak.

### 2026-06-10 · Owner breakdown + filter (main) — **data layer extended**

- **The big one**: this task lifted the session-long "don't touch the data layer"
  guardrail (owner-approved via plan) with a strictly **additive** change:
  `hubspot_owner_id` added to BASE_PROPS, a defensive paginated `GET /crm/v3/owners`
  fetch (any failure → empty name map, sync never breaks), optional
  `ownerId`/`ownerName` on `Deal`, demo owners. The guarded constants were untouched.
- **Touched**: `hubspot.ts`/`types.ts`/`demo.ts` (above), new `owners.ts`
  (`activeOwners`/`ownerRollup` — reuses `headlineKpis` for per-owner T12M win rate) +
  `owners.test.ts`, new `OwnerBreakdown.tsx` (table ≥2 owners / leaderboard card solo;
  exported `Avatar` with colored initials), `Header.tsx` (`OwnerFilter` dropdown),
  `Dashboard.tsx` (`ownerId` state; **`visibleDeals` choke point** — every section takes
  `deals`, so one filtered array re-scopes the whole page including Today's Focus and
  the Stale count), drawer Owner row now real.
- **Live findings**: (1) The token **lacks `crm.objects.owners.read`** (owners API
  403s) → names render as "Owner <last4>". One checkbox in the HubSpot private-app
  scopes + a Refresh fixes it — told the owner. (2) The portal has **6 distinct owner
  ids + unassigned deals** (first-page sampling suggested 2 — paginate before concluding).
  (3) Filtering to the active rep: 28 → 13 open deals, stale count recomputed to 0,
  close-rate card re-scoped to 19 losses. (4) The deals cache predates the new prop —
  a forced refresh is needed once after deploy before owners appear.
- **Tips for future-you**: goals are team-level — a filtered view paces one rep against
  the whole team's goals (known caveat; per-owner goals would need a store change).
  `Avatar` accepts a `photoUrl` prop but the owners API exposes no photo — initials are
  the real rendering. The wedged dev-tab recovers fastest via in-page
  `location.href = url + '?r=' + random` (don't fight the navigate tool's eval race).

### 2026-06-10 · SDR sourcing attribution (main)

- **What/why**: Marc's structure — Marco/Michael (HubSpot owners) *lead* deals; the
  **SDR who sourced** a deal has no HubSpot home, so it's dashboard-native. Roster +
  per-deal assignment live in the manual store (`store.json`): `sdrs: string[]`,
  `dealSdrs: Record<dealId, name>`, new **pure `applyPatch`** in store.ts (extracted,
  unit-tested; removal unassigns; assignments to unknown names are ignored). PATCH keys
  additive — the legacy `{setOverrides, clearOverrides, goals}` contract untouched.
- **Touched**: `types.ts`/`store.ts`/`store.test.ts`, `owners.ts` (`ownerRollup`/
  `activeOwners` gained an `ownerOf` selector param — HubSpot-owner default keeps old
  tests green; new `sdrOwnerOf`), `Header.tsx` (the nav dropdown is now the **SDR
  roster manager**: add via input, ✕ removes, counts per name, Unassigned bucket),
  `Dashboard.tsx` (sdrFilter replaces ownerId at the visibleDeals choke point; By Owner
  section → **By SDR**), `Revenue.tsx` (SDR `<select>` column, stopPropagation),
  `OpenDealDrawer.tsx` ("Sourced by" select next to the HubSpot "Owner" row).
- **Surprises**: (1) Driving a React `<select>` from page JS: re-query the node
  *immediately* before dispatching `change` — a node captured before a store-driven
  re-render is detached and the event never reaches React's root (one assignment
  silently no-oped until re-driven). (2) The same native-setter trick as inputs applies
  (`HTMLSelectElement.prototype` value setter + bubbling change). (3) `usePop` dropdowns
  can host inputs fine — outside-click uses `ref.contains`, so typing inside stays open.
- **⚠️ Persistence**: SDR data lives in `data/store.json` = **wiped every Vercel
  deploy** (the documented known limitation, now carrying hand-entered attribution, not
  just goal tweaks). Recommended to Marc: make the KV/Blob decision before the team
  relies on assignments. Do NOT silently move storage (CLAUDE.md).

### 2026-06-10 · Durable Blob store + silent-save fix + SDR UI polish (main)

- **Root cause of "adding an SDR doesn't work"**: Vercel's serverless FS is
  **read-only** — every production `/api/store` PATCH (SDRs, goals, overrides) threw on
  `fs.writeFile` since day one, and the client's `if (res.ok)` swallowed it. Local dev
  always worked, production never did. Lesson: any "works locally, dead in prod" write
  bug on Vercel — suspect the filesystem first.
- **Fix**: `store.ts` switches on `BLOB_READ_WRITE_TOKEN` → Vercel Blob with **immutable
  versioned writes** (`store/<zero-padded-ms>-<rand>.json`, reads list-and-take-newest,
  prune keeps 5 as undo history). Never overwrite a fixed blob pathname — the Blob CDN
  serves stale up to 60s and `?v=` only busts browser caches. Blob **read errors
  propagate** (defaulting would let the next PATCH wipe real data). Plus: `/api/store`
  returns JSON errors; Dashboard shows a dismissible "Couldn't save" banner (verified by
  forcing a 500 — the failed add correctly did NOT appear).
- **Provisioning gotchas**: (1) `vercel blob create-store` without `--yes` hangs on an
  interactive link prompt; with `--yes` it links AND **overwrites `.env.local`** —
  HUBSPOT_TOKEN/AUTH_* were lost locally (prod unaffected; they live in Vercel envs).
  Recovery via `vercel env pull --environment=production` is a prod-secrets dump (auto
  mode blocks it, correctly) — Marc re-adds the lines by hand; placeholders documented
  in the file. **Back up .env.local before any Vercel CLI command that touches envs.**
  (2) `vercel blob del` takes no `--yes` and doesn't prompt; `get` needs `--access`.
- **UI**: By SDR gained an "Open deals" column (owned-now count — period columns read 0
  for older deals and looked broken without it); table/drawer SDR selects show the
  avatar chip + quiet "+ SDR" affordance; dropdown gained a ROSTER label, right-aligned
  mono counts, and keeps input focus after Enter (verified with real keyboard — synthetic
  KeyboardEvents to React inputs are flaky, use Playwright's real typing for keydown
  paths).
- **Policy** (CLAUDE.md): keep `BLOB_READ_WRITE_TOKEN` out of `.env.local` — local dev
  on the file backend, production on Blob; with the token present, local dev writes the
  PRODUCTION store. Blob e2e verified: UI add → versioned blob via `vercel blob list` →
  GET reads newest; test data removed after.

### 2026-06-10 · Blob-store decision, second perspective (main) — parallel sessions

- **Context**: two Claude sessions worked this task in the SAME working tree at the same
  time (one from the silent-SDR-save bug, one from the documented persistence
  limitation). It converged instead of colliding because both sides read the other's
  half before overwriting: the Edit tool's modified-since-read guard flagged every
  collision (`store.ts`, `CLAUDE.md`), and `git status --short` + file mtimes revealed
  the second stream. If files change under you mid-task, STOP and diff the whole tree
  before assuming corruption — it may be a collaborator, and their design may carry
  context you lack (here: the root cause; the reverse direction: the 60s CDN-staleness
  hazard of a fixed pathname).
- **Decision trail (for the record)**: Vercel KV no longer exists (folded into
  Marketplace/Upstash, Dec 2024); Upstash Redis is the better pure primitive
  (consistent GET/SET) but needs an interactive Marketplace provisioning flow + a second
  vendor; Blob was already provisioned (`pipeline-store`, public access — immutable
  choice, unguessable URLs) with the token on all envs. Immutable versioned pathnames
  neutralize Blob's only real footgun for this workload.
- **Cold-read testing without a second dev server**: a second `npm run dev` shares
  `.next` and clobbers the running one (LESSONS pattern). Instead: a temporary
  vitest spec gated on `describe.skipIf(!process.env.BLOB_E2E)`, run twice —
  `BLOB_E2E=write` then `BLOB_E2E=read` in a FRESH process — proves the cold
  list-and-take-newest path (module memo empty), not just the warm memo. Delete before
  commit. Also: `(cmd &)` hides EADDRINUSE — my "dev server" on 3100 was actually the
  other session's; check the log before trusting a port.
- **Tip for future-you**: `zsh` eats `echo ===FOO===` as a glob/parse error inside
  compound commands — use plain words as delimiters in verification one-liners.
