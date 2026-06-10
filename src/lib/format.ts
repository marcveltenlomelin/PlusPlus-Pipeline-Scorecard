export function fmtMoney(n: number, opts: { compact?: boolean } = {}): string {
  if (opts.compact) {
    const abs = Math.abs(n);
    if (abs >= 1_000_000) return `$${(n / 1_000_000).toFixed(abs >= 10_000_000 ? 0 : 2).replace(/\.0+$/, "")}M`;
    if (abs >= 1_000) return `$${Math.round(n / 1_000)}K`;
  }
  return n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
}

export function fmtPct(rate: number | null, digits = 0): string {
  if (rate === null || !Number.isFinite(rate)) return "—";
  return `${(rate * 100).toFixed(digits)}%`;
}

export function fmtNum(n: number): string {
  return Number.isInteger(n) ? n.toLocaleString("en-US") : n.toFixed(1);
}

export function fmtDate(ts: number): string {
  return new Date(ts).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export function fmtDateTime(ts: number): string {
  return new Date(ts).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function daysAgo(ts: number, now: number): string {
  const d = Math.floor((now - ts) / 86_400_000);
  return d <= 0 ? "today" : d === 1 ? "1 day" : `${d} days`;
}
