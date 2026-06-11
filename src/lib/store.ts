import fs from "fs/promises";
import path from "path";
import { STAGE_GOALS } from "./config";
import type { GoalStage, Store, StorePatch } from "./types";

/**
 * File-backed persistence for the manual layer (overrides + goals + SDR
 * sourcing attribution). A single JSON file is plenty at this scale and
 * keeps local preview dependency-free; swap this module for a real store
 * when hosting. NOTE: on Vercel the filesystem resets per deploy — the
 * known limitation documented in CLAUDE.md.
 */

const STORE_FILE = path.join(process.cwd(), "data", "store.json");

function mergeGoals(saved?: Partial<Store["goals"]>): Store["goals"] {
  const goals = {} as Store["goals"];
  for (const stage of Object.keys(STAGE_GOALS) as GoalStage[]) {
    // per-stage merge so a partial edit never wipes the model defaults
    goals[stage] = { ...STAGE_GOALS[stage], ...(saved?.[stage] ?? {}) };
  }
  return goals;
}

export async function readStore(): Promise<Store> {
  try {
    const raw = JSON.parse(await fs.readFile(STORE_FILE, "utf8")) as Partial<Store>;
    return {
      goals: mergeGoals(raw.goals),
      overrides: raw.overrides ?? {},
      sdrs: raw.sdrs ?? [],
      dealSdrs: raw.dealSdrs ?? {},
    };
  } catch {
    return { goals: mergeGoals(), overrides: {}, sdrs: [], dealSdrs: {} };
  }
}

async function writeStore(store: Store): Promise<void> {
  await fs.mkdir(path.dirname(STORE_FILE), { recursive: true });
  await fs.writeFile(STORE_FILE, JSON.stringify(store, null, 2));
}

/** Pure patch semantics — unit-tested; patchStore is just read → this → write. */
export function applyPatch(store: Store, patch: StorePatch): Store {
  const next: Store = {
    goals: { ...store.goals },
    overrides: { ...store.overrides },
    sdrs: [...store.sdrs],
    dealSdrs: { ...store.dealSdrs },
  };
  for (const [stage, g] of Object.entries(patch.goals ?? {}) as [
    GoalStage,
    Partial<Store["goals"][GoalStage]>,
  ][]) {
    next.goals[stage] = { ...next.goals[stage], ...g };
  }
  if (patch.setOverrides) next.overrides = { ...next.overrides, ...patch.setOverrides };
  for (const key of patch.clearOverrides ?? []) delete next.overrides[key];

  for (const name of patch.addSdrs ?? []) {
    const trimmed = name.trim();
    if (trimmed && !next.sdrs.includes(trimmed)) next.sdrs.push(trimmed);
  }
  for (const name of patch.removeSdrs ?? []) {
    next.sdrs = next.sdrs.filter((s) => s !== name);
    // their assignments go too — an orphaned name would be unfilterable
    for (const [dealId, sdr] of Object.entries(next.dealSdrs)) {
      if (sdr === name) delete next.dealSdrs[dealId];
    }
  }
  for (const [dealId, sdr] of Object.entries(patch.setDealSdrs ?? {})) {
    if (sdr === null) delete next.dealSdrs[dealId];
    else if (next.sdrs.includes(sdr)) next.dealSdrs[dealId] = sdr;
  }
  return next;
}

export async function patchStore(patch: StorePatch): Promise<Store> {
  const store = applyPatch(await readStore(), patch);
  await writeStore(store);
  return store;
}
