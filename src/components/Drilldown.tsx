"use client";

import { useEffect, useRef } from "react";
import { fmtDate, fmtMoney } from "@/lib/format";
import type { DrillSpec } from "./ctx";

/**
 * The evidence layer: every headline number opens this modal listing the
 * exact HubSpot deals behind it, each linking to the live record.
 */
export default function Drilldown({ spec, onClose }: { spec: DrillSpec; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [onClose]);

  const sorted = [...spec.deals].sort(
    (a, b) => (spec.dateOf?.(b) ?? b.createdAt) - (spec.dateOf?.(a) ?? a.createdAt)
  );
  const total = sorted.reduce((s, d) => s + d.value, 0);

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4 backdrop-blur-[2px]"
      onMouseDown={(e) => {
        if (ref.current && !ref.current.contains(e.target as Node)) onClose();
      }}
    >
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-label={spec.title}
        className="rise flex max-h-[85vh] w-full max-w-3xl flex-col border border-rule-dark bg-panel shadow-pop"
      >
        <header className="flex items-start justify-between gap-4 border-b border-rule px-6 py-4">
          <div>
            <h2 className="font-display text-lg font-bold tracking-tight">{spec.title}</h2>
            {spec.subtitle && <p className="mt-0.5 text-xs text-ink-soft">{spec.subtitle}</p>}
            <p className="mt-1 font-mono text-xs text-ink-faint">
              {sorted.length} {sorted.length === 1 ? "deal" : "deals"} · {fmtMoney(total, { compact: true })} total value
            </p>
          </div>
          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="grid size-8 shrink-0 place-items-center border border-rule text-ink-soft hover:border-accent hover:text-accent"
          >
            ✕
          </button>
        </header>

        <div className="overflow-auto">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-panel">
              <tr className="border-b border-rule text-left">
                <th className="microlabel px-6 py-2.5 font-semibold">Deal</th>
                <th className="microlabel px-3 py-2.5 font-semibold">{spec.dateLabel ?? "Date"}</th>
                <th className="microlabel px-3 py-2.5 text-right font-semibold">Value</th>
                <th className="microlabel px-3 py-2.5 font-semibold">Stage now</th>
                <th className="px-6 py-2.5" />
              </tr>
            </thead>
            <tbody>
              {sorted.map((d) => {
                const ts = spec.dateOf?.(d) ?? d.createdAt;
                return (
                  <tr key={d.id} className="border-b border-rule/60 last:border-0 hover:bg-paper">
                    <td className="max-w-[16rem] truncate px-6 py-2.5 font-medium">{d.name}</td>
                    <td className="whitespace-nowrap px-3 py-2.5 font-mono text-xs text-ink-soft">{fmtDate(ts)}</td>
                    <td className="whitespace-nowrap px-3 py-2.5 text-right font-mono text-xs">
                      {fmtMoney(d.value, { compact: true })}
                      {d.amount === null && (
                        <span className="ml-1 text-[9px] uppercase text-ink-faint" title="No amount on the deal — counted at the $50K default">
                          est
                        </span>
                      )}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2.5 text-xs text-ink-soft">{d.stageLabel}</td>
                    <td className="whitespace-nowrap px-6 py-2.5 text-right">
                      <a
                        href={d.hubspotUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="font-mono text-xs text-accent underline decoration-accent/40 underline-offset-2 hover:decoration-accent"
                      >
                        HubSpot ↗
                      </a>
                    </td>
                  </tr>
                );
              })}
              {sorted.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-6 py-10 text-center text-sm text-ink-faint">
                    No deals in this bucket.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
