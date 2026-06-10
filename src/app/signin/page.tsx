import { signIn } from "@/auth";

function GoogleMark() {
  return (
    <svg viewBox="0 0 48 48" aria-hidden className="size-4 shrink-0">
      <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
      <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
      <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
      <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
    </svg>
  );
}

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  return (
    <main className="grid min-h-screen place-items-center bg-paper px-6">
      <div className="w-full max-w-sm border border-rule bg-panel p-8 shadow-card">
        <div className="flex items-center gap-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/plusplus-logo.png" alt="PlusPlus" className="size-10" />
          <p className="font-display text-2xl font-bold tracking-tight text-ink">Pipeline</p>
        </div>
        <p className="mt-2 text-sm text-ink-soft">
          This dashboard shows the full revenue pipeline. Sign in with your
          PlusPlus Google account to continue.
        </p>
        <form
          action={async () => {
            "use server";
            await signIn("google", { redirectTo: "/" });
          }}
        >
          <button
            type="submit"
            className="mt-6 flex w-full items-center justify-center gap-2.5 bg-ink px-4 py-2.5 text-sm font-semibold text-paper transition-colors hover:bg-accent focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2"
          >
            <GoogleMark />
            Continue with Google
          </button>
        </form>
        {error === "AccessDenied" ? (
          <p className="mt-3 text-sm text-bad" role="alert">
            That account isn&apos;t allowed — only verified @plusplus.co Google
            accounts can open this dashboard.
          </p>
        ) : error ? (
          <p className="mt-3 text-sm text-bad" role="alert">
            Sign-in failed — please try again.
          </p>
        ) : null}
      </div>
    </main>
  );
}
