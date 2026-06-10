"use client";

export type SkeletonKind = "cards" | "chart" | "bars" | "table" | "row";

/** A single skeleton block. */
function Block({ className }: { className: string }) {
  return <div className={`bg-ink/10 ${className}`} />;
}

/** Mock of a KPI card: label line, big number, foot line. */
function CardMock() {
  return (
    <div className="border border-rule bg-panel p-4">
      <Block className="h-2.5 w-20" />
      <Block className="mt-3 h-8 w-28" />
      <Block className="mt-3 h-2 w-full" />
    </div>
  );
}

function Shapes({ kind }: { kind: SkeletonKind }) {
  switch (kind) {
    case "cards":
      return (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <CardMock />
          <CardMock />
          <CardMock />
          <CardMock />
        </div>
      );
    case "chart":
      return (
        <div className="border border-rule bg-panel p-5">
          <svg viewBox="0 0 600 160" className="h-40 w-full" preserveAspectRatio="none">
            <path
              d="M0 120 C 60 60, 120 140, 180 90 S 300 30, 360 80 S 480 130, 540 70 L 600 90"
              fill="none"
              stroke="currentColor"
              strokeWidth="3"
              className="text-ink/15"
            />
            <line x1="0" y1="152" x2="600" y2="152" stroke="currentColor" strokeWidth="2" className="text-ink/10" />
          </svg>
        </div>
      );
    case "bars":
      return (
        <div className="grid gap-3 md:grid-cols-2">
          {[0, 1].map((i) => (
            <div key={i} className="border border-rule bg-panel p-5">
              <Block className="h-2.5 w-32" />
              <Block className="mt-3 h-9 w-24" />
              <Block className="mt-4 h-7 w-full" />
            </div>
          ))}
        </div>
      );
    case "table":
      return (
        <div className="border border-rule bg-panel p-5">
          <Block className="h-3 w-2/3" />
          {Array.from({ length: 8 }, (_, i) => (
            <Block key={i} className="mt-3 h-5 w-full" />
          ))}
        </div>
      );
    case "row":
      return (
        <div className="border border-rule bg-panel p-5">
          <Block className="h-10 w-full" />
        </div>
      );
  }
}

/**
 * Shimmering placeholder covering a section's content while a refresh is in
 * flight. Shapes roughly match the section's layout so nothing appears to
 * jump when live data lands.
 */
export default function SkeletonOverlay({ kind }: { kind: SkeletonKind }) {
  return (
    <div aria-hidden className="absolute inset-0 z-20 overflow-hidden bg-paper/90">
      <Shapes kind={kind} />
      <div className="shimmer pointer-events-none absolute inset-0" />
    </div>
  );
}
