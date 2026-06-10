export default async function GatePage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  return (
    <main className="grid min-h-screen place-items-center bg-paper px-6">
      <form
        method="POST"
        action="/api/gate"
        className="w-full max-w-sm border border-rule bg-panel p-8 shadow-card"
      >
        <div className="flex items-center gap-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/plusplus-logo.png" alt="PlusPlus" className="size-10" />
          <p className="font-display text-2xl font-bold tracking-tight text-ink">Pipeline</p>
        </div>
        <p className="mt-2 text-sm text-ink-soft">
          This dashboard shows the full revenue pipeline. Enter the team password to continue.
        </p>
        <label htmlFor="password" className="mt-6 block text-[11px] font-semibold uppercase tracking-[0.14em] text-ink-faint">
          Password
        </label>
        <input
          id="password"
          name="password"
          type="password"
          required
          autoFocus
          className="mt-1.5 w-full border border-rule bg-paper px-3 py-2 font-mono text-sm text-ink outline-none focus-visible:ring-2 focus-visible:ring-accent"
        />
        {error && <p className="mt-2 text-sm text-bad" role="alert">Wrong password — try again.</p>}
        <button
          type="submit"
          className="mt-5 w-full bg-ink px-4 py-2.5 text-sm font-semibold text-paper transition-colors hover:bg-accent focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2"
        >
          Open dashboard
        </button>
      </form>
    </main>
  );
}
