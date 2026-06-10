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
