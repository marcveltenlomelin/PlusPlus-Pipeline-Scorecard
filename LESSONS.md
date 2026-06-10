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
