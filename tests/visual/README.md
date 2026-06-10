# Visual verification screenshots

Playwright screenshots live here. Each feature PR adds a before/after pair named
`{feature}-before.png` and `{feature}-after.png`.

Capture both at desktop (**1440px**) and mobile (**390px**) widths — suffix with
`-mobile` for the 390px shots (e.g. `{feature}-after-mobile.png`). Screenshots are
taken with the Playwright MCP server against the local dev server
(`http://localhost:3000`).

Note: the app is auth-gated. For local screenshot runs, sign in once in the
Playwright browser session, or screenshot `/signin` itself when that's the surface
under change.
