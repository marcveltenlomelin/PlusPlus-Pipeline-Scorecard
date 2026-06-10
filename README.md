# ++ Pipeline Scoreboard

A throughput dashboard for the PlusPlus New Accounts pipeline. The HubSpot board shows
**occupancy** (where deals sit right now, which changes constantly); this shows **throughput**
(how many deals *entered* each stage in a week / month / quarter) — a number that never changes
once the period closes — tracked against goals, with conversion rates, close rate, pace-to-goal,
and a revenue view against the $1.2M net-new ARR target.

## Run it

```bash
npm install
cp .env.example .env.local   # add your HubSpot token (optional for preview)
npm run dev                  # http://localhost:3000
```

**No token? It still runs.** Without `HUBSPOT_TOKEN` the app serves realistic generated demo
data (clearly bannered) so every view, drill-down, and override can be reviewed immediately.

## HubSpot setup

Create a **Private App** (Settings → Integrations → Private Apps) with these scopes:

| Scope | Why |
|---|---|
| `crm.objects.deals.read` | read deals + stage-entry timestamps |
| `crm.schemas.deals.read` | read pipeline/stage labels (used to label stages and find the Pilot stage) |

Put the token in `.env.local` as `HUBSPOT_TOKEN`. It is used only inside Next.js API routes
and never reaches the browser.

### Env vars

| Var | Required | Purpose |
|---|---|---|
| `HUBSPOT_TOKEN` | for live data | Private App token, server-side only |
| `DASHBOARD_PASSWORD` | before hosting | enables the access gate (see below) |

## How the numbers are defined

Every number on the dashboard has an **ⓘ** popover with its definition and clicks through to
the exact HubSpot deal records behind it. The short version:

- **Stage entries** come from HubSpot's `hs_v2_date_entered_*` properties
  (SQL = `appointmentscheduled`, Deep Dive = `presentationscheduled`, Won/Lost = `closedwon`/`closedlost`).
- **SAL = deal created** (`createdate`). A deal is created when a first meeting is booked, so
  creation is the SAL signal. (The "SAL (Discovery Booked)" stage does have an auto entry
  timestamp, `hs_v2_date_entered_29982393`, but it only covers ~130 of 578 deals, so
  `createdate` remains the signal that covers everything.) Heads-up: bulk-imported deals carry
  the *import* date as `createdate`, which can spike the SAL count for the import period — the
  drill-down makes this visible.
- **Net New Opps = SQL entries** (single constant: `NET_NEW_OPP_STAGE` in `src/lib/config.ts`).
- **Pilot** = entered the "Review / Pilot" stage (id `29886531`). Reads `first_pilot_date`
  (workflow-set custom property) when present, falling back to HubSpot's auto-generated
  `hs_v2_date_entered_29886531` — verified populated in the live portal (34 deals incl. 2024
  history), so Pilot throughput works without waiting for the workflow. If neither exists on
  any deal, the card degrades to current occupancy and says so. Custom properties are requested
  defensively — the sync works even before `first_pilot_date` exists in the portal.
- **Deal value** = `amount`, or **$50,000** when unset (flagged `est` everywhere it appears).
- **Conversion** = trailing-90-day cohorts: of deals that entered stage A in the window, the
  share that has since entered stage B. **Close rate** = Won ÷ (Won + Lost) among deals closed
  in the window, vs a 50% target.
- **Projected ARR** = closed-won YTD + (open deals that entered SQL) × close rate.
- Periods bucket in the **viewer's local timezone**; weeks are ISO (Monday start);
  quarterly goals = 3× monthly, weekly = monthly × 12⁄52.

**Why it won't match the HubSpot board:** the board's columns lose deals the moment they
advance or close; these counts keep them. That's the point. The drill-down modal is the
audit trail for any skeptical reader.

## Manual layer

- Hover any value → ✎ to override it. Overrides persist (`data/store.json`), display an amber
  **MANUAL** badge, and revert to live with ↺ in one click.
- Goals (SAL 32/mo, Net New Opps 4/mo by default) are edited the same way on the pace cards
  and are always flagged manual; editing the weekly/quarterly figure converts back to the
  monthly base.

## Access gate

The dashboard renders the company's full pipeline, so it must never sit on a public URL
ungated. The gate is built in and inactive only while `DASHBOARD_PASSWORD` is unset (local
preview). Set the env var and every page/API request requires the password once per browser
(SHA-256 cookie, httpOnly, 30-day expiry, timing-safe compare). For real hosting, this drops
in as-is — or swap `src/middleware.ts` for your SSO of choice; it's the single choke point.

## Decisions worth knowing

- **Next.js 15 + API routes** — one process, token stays server-side, trivial to host later.
- **List endpoint, not the Search API** — `GET /crm/v3/objects/deals` paginates the whole
  portal with no 10k-result cap and no search rate limits, then filters to the `default`
  pipeline server-side. Works on the free tier.
- **Fetch/cache strategy** — server caches syncs for 5 minutes in memory and persists the
  last good sync to `data/cache.json`; the Refresh button forces a live pull. If HubSpot is
  down, the app serves the last good sync with an explicit "cached" banner instead of erroring.
- **Aggregation happens client-side** over the normalized deal list, so switching week/month/
  quarter or stepping through past periods is instant and every aggregate stays drillable.
- **Storage is a JSON file** (`data/store.json`) for overrides + goals — zero infra for local
  use; `src/lib/store.ts` is the one module to swap for a real store when hosting.
- **No design file was provided** in the project folder, so the visual system was designed from
  the brief: a light "printed ledger" aesthetic (paper ground, hairline rules, tabular mono
  numerals) to reinforce that these are stable, auditable numbers — with PlusPlus's `++` mark
  and a single cobalt accent.
- Charts: Recharts; fonts: Archivo + Spline Sans Mono via `next/font`. Reduced motion is
  respected globally; everything is keyboard-reachable (definitions, overrides, drill-downs).

## Layout

```
src/
  app/            pages + API routes (deals, store, gate)
  components/     Dashboard (state/context) + sections (Scoreboard, Pace, Trends, Funnel, Revenue, Drilldown)
  lib/            config.ts (all constants/definitions) · hubspot.ts (sync) · metrics.ts (pure math)
                  periods.ts (week/month/quarter) · store.ts (persistence) · demo.ts (sample data)
data/             store.json (overrides/goals) + cache.json — gitignored
```
