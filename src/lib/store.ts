import { del, list, put } from "@vercel/blob";
import { randomUUID } from "crypto";
import fs from "fs/promises";
import path from "path";
import { STAGE_GOALS } from "./config";
import {
  defaultDigest,
  type AnnotationColor,
  type AnnotationOp,
  type ChartAnnotation,
  type GoalStage,
  type Store,
  type StorePatch,
} from "./types";

/**
 * Persistence for the manual layer (overrides + goals + SDR sourcing
 * attribution) — one small JSON document.
 *
 * Backend switches on BLOB_READ_WRITE_TOKEN:
 *  - present (Vercel + local dev with the pulled token): Vercel Blob as
 *    immutable versions under `store/`. Every write creates a NEW pathname
 *    and reads list-and-take-newest. A never-seen pathname is always a CDN
 *    cache miss, so reads are always fresh — overwriting a fixed pathname
 *    would serve stale content for up to 60s (Blob CDN propagation; the
 *    `?v=` query-param trick in the docs only busts *browser* caches).
 *  - absent: the original data/store.json file (dependency-free local dev).
 *
 * Known trade-offs (documented in CLAUDE.md): blob URLs are
 * public-but-unguessable (random store subdomain + random version suffix;
 * contents are goals/SDR names/deal ids), and concurrent PATCHes from
 * different instances are whole-document last-write-wins — same race the
 * file ever had; this is a single-operator tool. The memo below makes one
 * editor's rapid sequential edits safe on a warm instance.
 */

const STORE_FILE = path.join(process.cwd(), "data", "store.json");

const VERSION_PREFIX = "store/";
/** Versions kept after a write — a small undo history; older ones pruned. */
const KEEP_VERSIONS = 5;

const useBlob = () => Boolean(process.env.BLOB_READ_WRITE_TOKEN);

/** Pathname for a new immutable version; lexicographic order = time order. */
export function versionPathname(now: number, rand: string): string {
  return `${VERSION_PREFIX}${String(now).padStart(14, "0")}-${rand}.json`;
}

/** Newest version among pathnames (14-digit zero-padded ms sort as strings). */
export function latestVersion(pathnames: string[]): string | null {
  let latest: string | null = null;
  for (const p of pathnames) {
    if (!p.startsWith(VERSION_PREFIX)) continue;
    if (latest === null || p > latest) latest = p;
  }
  return latest;
}

/**
 * Same-instance read-after-write guard: if list() lags a just-completed
 * write, serve the version we know about. NOT a TTL cache — every read
 * still lists, so edits from other instances appear immediately.
 */
let memo: { pathname: string; store: Store } | null = null;

async function readBlob(): Promise<Store> {
  // Infrastructure errors deliberately propagate: swallowing them into a
  // default store would let the next PATCH persist defaults and wipe real
  // data. The route 500s instead and the dashboard shows its error chip.
  const { blobs } = await list({ prefix: VERSION_PREFIX });
  const newest = latestVersion(blobs.map((b) => b.pathname));
  if (memo && (newest === null || memo.pathname >= newest)) return memo.store;
  if (newest === null) return hydrate(null); // first run — defaults
  const url = blobs.find((b) => b.pathname === newest)!.url;
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`Blob read failed (${res.status})`);
  const store = hydrate((await res.json()) as Partial<Store>);
  memo = { pathname: newest, store };
  return store;
}

async function writeBlob(store: Store): Promise<void> {
  const pathname = versionPathname(Date.now(), randomUUID().slice(0, 8));
  await put(pathname, JSON.stringify(store, null, 2), {
    access: "public",
    addRandomSuffix: false,
    contentType: "application/json",
  });
  memo = { pathname, store };
  try {
    // best-effort prune — a failure here must never fail the PATCH
    const { blobs } = await list({ prefix: VERSION_PREFIX });
    const stale = blobs
      .filter((b) => b.pathname.startsWith(VERSION_PREFIX))
      .sort((a, b) => (a.pathname < b.pathname ? 1 : -1))
      .slice(KEEP_VERSIONS);
    if (stale.length > 0) await del(stale.map((b) => b.url));
  } catch {
    /* pruned next time */
  }
}

function mergeGoals(saved?: Partial<Store["goals"]>): Store["goals"] {
  const goals = {} as Store["goals"];
  for (const stage of Object.keys(STAGE_GOALS) as GoalStage[]) {
    // per-stage merge so a partial edit never wipes the model defaults
    goals[stage] = { ...STAGE_GOALS[stage], ...(saved?.[stage] ?? {}) };
  }
  return goals;
}

function hydrate(raw: Partial<Store> | null): Store {
  const digest = defaultDigest();
  return {
    goals: mergeGoals(raw?.goals),
    overrides: raw?.overrides ?? {},
    sdrs: raw?.sdrs ?? [],
    digest: {
      ...digest,
      ...(raw?.digest ?? {}),
      sections: { ...digest.sections, ...(raw?.digest?.sections ?? {}) },
    },
    annotations: raw?.annotations ?? [],
  };
}

/* ── Chart annotations ───────────────────────────────────────────────── */

const ANNOTATION_COLORS: AnnotationColor[] = ["accent", "good", "warn", "bad", "ahead"];

function validateAnnotationFields(title: string, description: string | undefined, color: AnnotationColor): void {
  if (!title.trim()) throw new AnnotationError(400, "Title is required");
  if (title.length > 60) throw new AnnotationError(400, "Title must be 60 characters or fewer");
  if (description !== undefined && description.length > 280)
    throw new AnnotationError(400, "Description must be 280 characters or fewer");
  if (!ANNOTATION_COLORS.includes(color)) throw new AnnotationError(400, "Unknown color");
}

export class AnnotationError extends Error {
  constructor(
    public status: number,
    message: string
  ) {
    super(message);
  }
}

/**
 * Pure annotation reducer — permission and validation logic in one testable
 * place. Authors edit/delete their own; admins anyone's. The author email and
 * timestamps come from the CALLER (the API route stamps them from the
 * session) — this function never trusts op-supplied identity. Deliberately
 * not reachable through /api/store's applyPatch.
 */
export function applyAnnotationOp(
  store: Store,
  op: AnnotationOp,
  actor: { email: string; isAdmin: boolean },
  stamp: { id: string; now: number }
): Store {
  if (op.kind === "create") {
    validateAnnotationFields(op.title, op.description, op.color);
    if (!/^\d{4}-\d{2}$/.test(op.monthIso)) throw new AnnotationError(400, "monthIso must be YYYY-MM");
    const annotation: ChartAnnotation = {
      id: stamp.id,
      monthIso: op.monthIso,
      title: op.title.trim(),
      description: op.description?.trim() || undefined,
      color: op.color,
      authorEmail: actor.email,
      createdAt: stamp.now,
      updatedAt: stamp.now,
    };
    return { ...store, annotations: [...store.annotations, annotation] };
  }

  const existing = store.annotations.find((a) => a.id === op.id);
  if (!existing) throw new AnnotationError(404, "Annotation not found");
  if (existing.authorEmail !== actor.email && !actor.isAdmin)
    throw new AnnotationError(403, "Only the author or an admin can change this note");

  if (op.kind === "delete") {
    return { ...store, annotations: store.annotations.filter((a) => a.id !== op.id) };
  }

  validateAnnotationFields(op.title, op.description, op.color);
  return {
    ...store,
    annotations: store.annotations.map((a) =>
      a.id === op.id
        ? {
            ...a,
            title: op.title.trim(),
            description: op.description?.trim() || undefined,
            color: op.color,
            updatedAt: stamp.now,
          }
        : a
    ),
  };
}

export async function readStore(): Promise<Store> {
  if (useBlob()) return readBlob();
  try {
    return hydrate(JSON.parse(await fs.readFile(STORE_FILE, "utf8")) as Partial<Store>);
  } catch {
    return hydrate(null);
  }
}

export async function writeStore(store: Store): Promise<void> {
  if (useBlob()) {
    await writeBlob(store);
    return;
  }
  await fs.mkdir(path.dirname(STORE_FILE), { recursive: true });
  await fs.writeFile(STORE_FILE, JSON.stringify(store, null, 2));
}

/** Pure patch semantics — unit-tested; patchStore is just read → this → write. */
export function applyPatch(store: Store, patch: StorePatch): Store {
  const next: Store = {
    goals: { ...store.goals },
    overrides: { ...store.overrides },
    sdrs: [...store.sdrs],
    digest: { ...store.digest, sections: { ...store.digest.sections } },
    annotations: [...store.annotations], // mutated only via applyAnnotationOp
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
    // roster-only: assignments live on the deals (HubSpot sourcing_sdr) and
    // keep displaying/rolling up even for removed names
    next.sdrs = next.sdrs.filter((s) => s !== name);
  }

  if (patch.digest) {
    next.digest = {
      ...next.digest,
      ...patch.digest,
      // recipients normalize: trimmed, lowercased, deduped
      recipients: (patch.digest.recipients ?? next.digest.recipients)
        .map((r) => r.trim().toLowerCase())
        .filter((r, i, a) => r.includes("@") && a.indexOf(r) === i),
      sections: { ...next.digest.sections, ...(patch.digest.sections ?? {}) },
    };
  }
  return next;
}

export async function patchStore(patch: StorePatch): Promise<Store> {
  const store = applyPatch(await readStore(), patch);
  await writeStore(store);
  return store;
}
