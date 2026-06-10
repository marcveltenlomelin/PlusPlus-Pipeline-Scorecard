"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { daysAgo, fmtDate, fmtMoney } from "@/lib/format";
import type { Deal } from "@/lib/types";
import { useDash } from "./ctx";

/** One label/value line in the drawer's detail list. */
function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid grid-cols-[6.5rem_1fr] gap-3 border-b border-rule/60 py-2.5 last:border-0">
      <dt className="microlabel pt-px">{label}</dt>
      <dd className="text-sm">{children}</dd>
    </div>
  );
}

/** Fields not yet synced from HubSpot — rendered as a quiet placeholder. */
function NotSynced() {
  return <span className="italic text-ink-faint">Not synced yet</span>;
}

/**
 * Right-anchored detail drawer for a single open deal. Inspect a deal without
 * leaving the dashboard; the prominent footer button opens the live record.
 * Mirrors Drilldown's dismiss behavior (Escape, outside-click, scroll-lock).
 */
export default function OpenDealDrawer({ deal, onClose }: { deal: Deal; onClose: () => void }) {
  const { now } = useDash();
  const ref = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  // Portal target only exists in the browser — guard SSR / HMR re-render.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

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

  if (!mounted) return null;

  // Portal to <body> so the panel escapes the `.rise` section's stacking
  // context — otherwise the sticky header (z-30, top level) paints over it.
  return createPortal(
    <div
      className="fixed inset-0 z-50 flex bg-black/60 backdrop-blur-[2px]"
      onMouseDown={(e) => {
        if (ref.current && !ref.current.contains(e.target as Node)) onClose();
      }}
    >
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-label={deal.name}
        className="rise ml-auto flex h-full w-full flex-col border-l border-rule-dark bg-panel shadow-pop sm:w-[26rem]"
      >
        <header className="flex items-start justify-between gap-4 border-b border-rule px-5 py-4">
          <div>
            <p className="microlabel">Open deal</p>
            <h2 className="mt-1 font-display text-lg font-bold leading-tight tracking-tight">{deal.name}</h2>
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

        <dl className="flex-1 overflow-auto px-5 py-2">
          <Row label="Stage">
            <span className="text-ink-soft">{deal.stageLabel}</span>
          </Row>
          <Row label="Value">
            <span className="font-mono">{fmtMoney(deal.value, { compact: true })}</span>
            {deal.amount === null && (
              <span className="ml-1.5 text-[9px] uppercase text-ink-faint" title="No amount on the deal — counted at the $50K default">
                est
              </span>
            )}
          </Row>
          <Row label="Owner">
            <NotSynced />
          </Row>
          <Row label="Created">
            <span className="font-mono text-ink-soft">{fmtDate(deal.createdAt)}</span>
          </Row>
          <Row label="Age">
            <span className="font-mono text-ink-soft">{daysAgo(deal.createdAt, now)}</span>
          </Row>
          <Row label="Last activity">
            <NotSynced />
          </Row>
          <Row label="Next step">
            <NotSynced />
          </Row>
        </dl>

        <footer className="border-t border-rule px-5 py-4">
          <a
            href={deal.hubspotUrl}
            target="_blank"
            rel="noreferrer"
            className="block bg-accent px-4 py-2.5 text-center text-sm font-semibold text-white hover:opacity-90"
          >
            Open in HubSpot ↗
          </a>
        </footer>
      </div>
    </div>,
    document.body
  );
}
