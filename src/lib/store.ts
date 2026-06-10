import fs from "fs/promises";
import path from "path";
import { STAGE_GOALS } from "./config";
import type { GoalStage, Override, Store } from "./types";

/**
 * File-backed persistence for the manual layer (overrides + goals).
 * A single JSON file is plenty at this scale and keeps local preview
 * dependency-free; swap this module for a real store when hosting.
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
    };
  } catch {
    return { goals: mergeGoals(), overrides: {} };
  }
}

async function writeStore(store: Store): Promise<void> {
  await fs.mkdir(path.dirname(STORE_FILE), { recursive: true });
  await fs.writeFile(STORE_FILE, JSON.stringify(store, null, 2));
}

export async function patchStore(patch: {
  goals?: Partial<Record<GoalStage, Partial<Store["goals"][GoalStage]>>>;
  setOverrides?: Record<string, Override>;
  clearOverrides?: string[];
}): Promise<Store> {
  const store = await readStore();
  for (const [stage, g] of Object.entries(patch.goals ?? {}) as [GoalStage, Partial<Store["goals"][GoalStage]>][]) {
    store.goals[stage] = { ...store.goals[stage], ...g };
  }
  if (patch.setOverrides) store.overrides = { ...store.overrides, ...patch.setOverrides };
  for (const key of patch.clearOverrides ?? []) delete store.overrides[key];
  await writeStore(store);
  return store;
}
