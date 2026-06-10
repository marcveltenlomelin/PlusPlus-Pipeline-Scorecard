"use client";

import { createContext, useContext } from "react";
import type { Deal, Override } from "@/lib/types";

export interface DrillSpec {
  title: string;
  subtitle?: string;
  deals: Deal[];
  /** Which date column to show per deal (e.g. when it entered the stage). */
  dateOf?: (d: Deal) => number | undefined;
  dateLabel?: string;
}

export interface DashContextValue {
  overrides: Record<string, Override>;
  setOverride: (id: string, value: number) => void;
  clearOverride: (id: string) => void;
  openDrill: (spec: DrillSpec) => void;
  now: number;
}

export const DashCtx = createContext<DashContextValue | null>(null);

export function useDash(): DashContextValue {
  const ctx = useContext(DashCtx);
  if (!ctx) throw new Error("useDash outside DashCtx");
  return ctx;
}

/** Resolve a metric cell: manual override wins over the live value. */
export function useResolved(id: string, live: number | null): { value: number | null; manual: boolean } {
  const { overrides } = useDash();
  const o = overrides[id];
  return o ? { value: o.value, manual: true } : { value: live, manual: false };
}
