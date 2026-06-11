"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { defaultDigest, type DigestCadence, type DigestConfig, type DigestSection, type Store } from "@/lib/types";

const CADENCES: { value: DigestCadence; label: string; hint: string }[] = [
  { value: "weekly", label: "Weekly", hint: "Tuesdays · 8am PT, before the pipeline call (default)" },
  { value: "biweekly", label: "Bi-weekly", hint: "every other Tuesday" },
  { value: "monthly", label: "Monthly", hint: "first Tuesday of the month" },
];

const SECTIONS: { key: DigestSection; label: string }[] = [
  { key: "headline", label: "Headline KPIs" },
  { key: "focus", label: "Today's Focus" },
  { key: "funnel", label: "Funnel" },
  { key: "sdr", label: "By SDR (weekly)" },
  { key: "leaks", label: "Leaks" },
  { key: "revenue", label: "Revenue" },
  { key: "stale", label: "Stale deals" },
];

export default function DigestSettings() {
  const [digest, setDigest] = useState<DigestConfig>(defaultDigest());
  const [draft, setDraft] = useState("");
  const [status, setStatus] = useState<{ kind: "ok" | "err"; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    fetch("/api/store")
      .then((r) => r.json())
      .then((s: Store) => {
        setDigest(s.digest);
        setLoaded(true);
      })
      .catch(() => setStatus({ kind: "err", text: "Couldn't load settings" }));
  }, []);

  type DigestPatch = Partial<Omit<DigestConfig, "sections">> & {
    sections?: Partial<Record<DigestSection, boolean>>;
  };

  const save = async (patch: DigestPatch) => {
    setBusy(true);
    setStatus(null);
    try {
      const res = await fetch("/api/store", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ digest: patch }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? `HTTP ${res.status}`);
      }
      const s = (await res.json()) as Store;
      setDigest(s.digest);
      setStatus({ kind: "ok", text: "Saved" });
    } catch (err) {
      setStatus({ kind: "err", text: err instanceof Error ? err.message : "Save failed" });
    } finally {
      setBusy(false);
    }
  };

  const addRecipient = () => {
    const email = draft.trim().toLowerCase();
    if (!email.includes("@")) {
      setStatus({ kind: "err", text: "That doesn't look like an email" });
      return;
    }
    void save({ recipients: [...digest.recipients, email] });
    setDraft("");
  };

  const sendTest = async () => {
    setBusy(true);
    setStatus(null);
    try {
      const res = await fetch("/api/digest/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ test: true }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? `HTTP ${res.status}`);
      setStatus({ kind: "ok", text: `Test sent: "${body.subject}" → ${body.results?.[0]?.to} (${body.status ?? "queued"})` });
    } catch (err) {
      setStatus({ kind: "err", text: err instanceof Error ? err.message : "Test send failed" });
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="mx-auto max-w-2xl px-5 py-10 sm:px-8">
      <Link href="/" className="font-mono text-xs text-accent underline underline-offset-2">
        ← Back to scoreboard
      </Link>
      <h1 className="mt-4 font-display text-xl font-extrabold tracking-tight">Email digest</h1>
      <p className="mt-1 text-xs text-ink-faint">
        A weekly summary of the scorecard, sent by the dashboard. @plusplus.co recipients get deal-level detail;
        anyone else gets aggregates only.
      </p>

      {status && (
        <p
          role="status"
          className={`mt-4 border px-3 py-2 text-xs ${
            status.kind === "ok" ? "border-good/40 bg-good-soft text-good" : "border-bad/40 bg-bad-soft text-bad"
          }`}
        >
          {status.text}
        </p>
      )}

      {!loaded ? (
        <p className="mt-8 font-mono text-sm text-ink-faint animate-pulse">loading…</p>
      ) : (
        <div className="mt-6 space-y-6">
          <section className="border border-rule bg-panel p-5 shadow-card">
            <h2 className="microlabel">Recipients</h2>
            <ul className="mt-3 space-y-1.5">
              {digest.recipients.length === 0 && (
                <li className="text-xs italic text-ink-faint">Nobody yet — add an address below.</li>
              )}
              {digest.recipients.map((r) => (
                <li key={r} className="flex items-center justify-between gap-2 font-mono text-sm">
                  <span>
                    {r}
                    <span className="ml-2 text-[9px] uppercase text-ink-faint">
                      {r.endsWith("@plusplus.co") ? "full detail" : "aggregates only"}
                    </span>
                  </span>
                  <button
                    type="button"
                    onClick={() => void save({ recipients: digest.recipients.filter((x) => x !== r) })}
                    aria-label={`Remove ${r}`}
                    className="text-ink-faint hover:text-bad"
                  >
                    ✕
                  </button>
                </li>
              ))}
            </ul>
            <div className="mt-3 flex gap-2">
              <input
                type="email"
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && addRecipient()}
                placeholder="name@company.com"
                className="w-full border border-rule bg-paper px-2 py-1.5 text-sm focus:border-accent focus:outline-none"
              />
              <button
                type="button"
                onClick={addRecipient}
                disabled={busy}
                className="whitespace-nowrap border border-rule-dark px-3 py-1.5 text-xs font-semibold text-ink-soft hover:border-accent hover:text-accent disabled:opacity-40"
              >
                Add
              </button>
            </div>
          </section>

          <section className="border border-rule bg-panel p-5 shadow-card">
            <h2 className="microlabel">Cadence</h2>
            <div className="mt-3 space-y-2">
              {CADENCES.map((c) => (
                <label key={c.value} className="flex cursor-pointer items-center gap-2.5 text-sm">
                  <input
                    type="radio"
                    name="cadence"
                    checked={digest.cadence === c.value}
                    onChange={() => void save({ cadence: c.value })}
                    className="accent-[#6e87ff]"
                  />
                  <span className="font-semibold">{c.label}</span>
                  <span className="font-mono text-[11px] text-ink-faint">{c.hint}</span>
                </label>
              ))}
            </div>
          </section>

          <section className="border border-rule bg-panel p-5 shadow-card">
            <h2 className="microlabel">Sections</h2>
            <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
              {SECTIONS.map((s) => (
                <label key={s.key} className="flex cursor-pointer items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={digest.sections[s.key]}
                    onChange={(e) => void save({ sections: { [s.key]: e.target.checked } })}
                    className="accent-[#6e87ff]"
                  />
                  {s.label}
                </label>
              ))}
            </div>
          </section>

          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={() => void sendTest()}
              disabled={busy}
              className="border border-ink bg-ink px-4 py-2 text-xs font-bold uppercase tracking-wider text-paper hover:border-accent hover:bg-accent disabled:opacity-50"
            >
              Send me a test
            </button>
            <a
              href="/api/digest/preview"
              target="_blank"
              rel="noreferrer"
              className="font-mono text-xs text-accent underline underline-offset-2"
            >
              Preview in browser ↗
            </a>
            <a
              href="/api/digest/preview?variant=aggregate"
              target="_blank"
              rel="noreferrer"
              className="font-mono text-xs text-ink-faint underline underline-offset-2 hover:text-accent"
            >
              aggregate variant ↗
            </a>
          </div>
        </div>
      )}
    </main>
  );
}
