# PlusPlus Pipeline Scorecard

## Overview

Internal revenue dashboard for PlusPlus. It reads deals from HubSpot (portal **3109109**)
and shows **stage-entry throughput per period** (week/month/quarter/year) against goals —
deliberately *not* board occupancy, so numbers won't match the HubSpot board (that's the
point; the drill-down modal is the audit trail). Live at
https://plus-plus-pipeline-scorecard.vercel.app, gated behind Google sign-in restricted to
verified @plusplus.co Workspace accounts.

## Tech stack

- Next.js **15.3** (App Router) · React **19.1** · TypeScript **5** (strict, `@/*` → `src/*`)
- Tailwind CSS **4.1** — theme tokens via `@theme` in `src/app/globals.css`, no tailwind.config
- Recharts **2.15** (FunnelTrend line chart, Trends bar chart)
- Auth.js / next-auth **5 beta** with Google OAuth (`src/auth.ts`, `src/middleware.ts`)
- No database: JSON files in `data/` (gitignored). Deployed on Vercel.

## Run / build / check

```bash
npm run dev              # dev server on http://localhost:3000
npm run build            # production build (also the de-facto typecheck gate)
npx tsc --noEmit         # typecheck only
scripts/dev-check.sh     # boots dev server, waits for ready, typechecks; pass/fail
```

There are **no unit tests and no ESLint config** yet. Visual verification uses Playwright
MCP screenshots — see `tests/visual/README.md`.

Env vars (`.env.local`, never committed): `HUBSPOT_TOKEN` (without it the app runs in demo
mode with seeded synthetic data), `AUTH_SECRET`, `AUTH_GOOGLE_ID`, `AUTH_GOOGLE_SECRET`
(Google sign-in). Same vars are set on Vercel Production.

## Data flow (HubSpot → UI)

1. `src/lib/hubspot.ts` pulls `GET /crm/v3/objects/deals` (list endpoint, cursor pagination,
   100/page — deliberately not the Search API: no 10k cap, no tight rate limits). Requests
   `hs_v2_date_entered_*` stage-entry timestamps plus `first_pilot_date` (custom prop,
   gracefully dropped via 400-retry if it doesn't exist in the portal yet).
2. Three-tier cache: 5-min in-memory memo → `data/cache.json` on disk (serves stale with a
   "cached" banner if HubSpot is down) → demo mode when `HUBSPOT_TOKEN` is unset.
3. `/api/deals` returns the normalized `DealsPayload`; `?refresh=1` forces a live fetch.
4. `src/lib/metrics.ts` = pure functions over `Deal[]` (entries per period, trailing-90-day
   conversion cohorts, close rate, straight-line pace projections).
5. Manual layer: `/api/store` GET/PATCH persists goals + per-cell overrides to
   `data/store.json`. Override IDs follow `domain:stage:period` (e.g. `tp:sal:2026-06`).

## Conventions observed

- **Components** in `src/components/`, PascalCase, one top-level component per file with
  small subcomponents inline (e.g. `StageCard` inside `Scoreboard.tsx`). Props interfaces
  named `XyzProps`. Everything under `Dashboard` is `"use client"`; `Dashboard` is the
  single client boundary and state orchestrator.
- **State**: React context (`src/components/ctx.ts` — `useDash()`, `useResolved()`) for
  overrides/drill-down/now; local `useState` for UI chrome. No Redux/Zustand.
- **Logic** lives in `src/lib/` as pure, typed functions — keep components thin.
- **Styling**: only semantic tokens — `paper`/`panel` (backgrounds), `ink`/`ink-soft`/
  `ink-faint` (text), `rule`/`rule-dark` (borders), `accent`, and signal colors
  `good`/`warn`/`bad`/`manual` each with a `-soft` background variant. Utilities
  `.microlabel` (tiny uppercase labels) and `.rise` (entrance animation). Numerals use
  `font-mono` (tabular). Never hardcode hex in JSX — except the chart-color constants noted
  below.
- **Patterns**: popovers via the `usePop` hook idiom (outside-click + Escape, `.rise` +
  `shadow-pop`); editable numbers via the `Metric` primitive (hover ✎, manual badge, ↺
  revert); every metric gets an ⓘ InfoTip stating its exact definition; drill-down tables
  link each row to the HubSpot deal record.

## DO NOT

- **Don't touch the hardcoded HubSpot stage property names** (`hs_v2_date_entered_
  appointmentscheduled|presentationscheduled|closedwon|closedlost`, pilot stage id
  `29886531`) — verified against the live portal; changing them silently zeroes metrics.
- **Don't turn off `INFER_SKIPPED_SQL`** in `src/lib/config.ts` — it backfills SQL entry
  for deals that skipped the stage; disabling silently undercounts Net New Opps.
- **`createdate` = SAL signal is intentional** (deal creation means first meeting booked).
  Don't "correct" it to a stage-entry timestamp — coverage is ~130/578 deals.
- **Don't weaken auth**: the `signIn` callback must keep requiring `email_verified` AND
  `hd === "plusplus.co"`; the middleware matcher must keep covering all pages/APIs while
  excluding `/signin`, `/api/auth`, and static assets.
- **Don't remove the `mounted` hydration guard** in `Dashboard.tsx` (date math differs
  server vs client) and don't move period bucketing off the viewer's local timezone.
- **API contracts are load-bearing**: `DealsPayload` shape from `/api/deals` and the
  `{ setOverrides, clearOverrides, goals }` PATCH shape on `/api/store` are consumed across
  many components.
- **Chart colors in `FunnelTrend.tsx` are JS constants** duplicating the CSS tokens — if you
  change a token in `globals.css`, update them too.
- **`data/` persistence is ephemeral on Vercel** (filesystem resets per deploy/instance) —
  known limitation; don't silently "fix" it, it needs a real decision (KV/blob store).
- **Counts are stage entries, not board occupancy** — don't "fix" the mismatch with the
  HubSpot board view.
- **Never commit `.env.local`** (HubSpot token + OAuth secrets) or anything in `data/`.

## Working agreement

Read this file **and [LESSONS.md](LESSONS.md)** before starting any task, and append a
LESSONS.md entry after finishing one. Plan before writing code and get the plan approved
(plan mode). Verify UI changes with Playwright MCP before/after screenshots at **1440px and
390px** widths (store in `tests/visual/`). Never weaken or delete tests to make things
pass. Ask when ambiguous.

**Trunk-based, no PRs** (owner's preference, 2026-06-10): commit small reviewable commits
directly on `main`. No feature branches, no pull requests, nothing for the owner to merge.
When the owner says to ship/push live: `git push origin main` then `vercel deploy --prod`
(CLI is linked to the `plus-plus-pipeline-scorecard` project). Deploy only on command —
verified work can sit committed on `main` until then.
