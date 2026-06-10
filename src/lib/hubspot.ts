import fs from "fs/promises";
import path from "path";
import {
  CACHE_TTL_MS,
  DEFAULT_DEAL_VALUE,
  INFER_SKIPPED_SQL,
  PILOT_ENTRY_FALLBACK_PROP,
  PILOT_STAGE_MATCH,
  PIPELINE_ID,
  STAGE_ENTRY_PROPS,
  dealUrl,
} from "./config";
import { demoDeals } from "./demo";
import type { Deal, DealsPayload, StageKey } from "./types";

/**
 * Server-only HubSpot client. The token never leaves this module.
 *
 * Uses the plain list endpoint (GET /crm/v3/objects/deals) rather than the
 * Search API: no 10k-result cap, no 4-req/s search limit, and it works on the
 * free tier with just crm.objects.deals.read. We filter to the target
 * pipeline server-side.
 */

const HS = "https://api.hubapi.com";

const BASE_PROPS = ["dealname", "amount", "dealstage", "pipeline", "createdate"];

interface PipelineStage {
  id: string;
  label: string;
  isClosed: boolean;
}

interface CacheShape {
  payload: DealsPayload;
  pilotStageId: string | null;
}

let memo: { at: number; data: CacheShape } | null = null;

const CACHE_FILE = path.join(process.cwd(), "data", "cache.json");

async function hsGet(token: string, url: string): Promise<Response> {
  return fetch(url, { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" });
}

async function fetchPipelineStages(token: string): Promise<PipelineStage[]> {
  const res = await hsGet(token, `${HS}/crm/v3/pipelines/deals/${PIPELINE_ID}`);
  if (!res.ok) throw new Error(`Pipeline metadata fetch failed (${res.status})`);
  const json = await res.json();
  return (json.stages ?? []).map(
    (s: { id: string; label: string; metadata?: { isClosed?: string | boolean } }) => ({
      id: s.id,
      label: s.label,
      isClosed: s.metadata?.isClosed === "true" || s.metadata?.isClosed === true,
    })
  );
}

async function fetchAllDeals(token: string, properties: string[]): Promise<Record<string, unknown>[]> {
  const out: Record<string, unknown>[] = [];
  let after: string | undefined;
  do {
    const params = new URLSearchParams({
      limit: "100",
      archived: "false",
      properties: properties.join(","),
    });
    if (after) params.set("after", after);
    const res = await hsGet(token, `${HS}/crm/v3/objects/deals?${params}`);
    if (!res.ok) {
      const body = await res.text();
      // Custom properties (first_pilot_date today, possibly others later) may
      // not exist in the portal yet — drop whichever one the error names and
      // retry instead of failing the whole sync.
      if (res.status === 400) {
        const missing = properties.find((p) => p.startsWith("first_") && body.includes(p));
        if (missing) return fetchAllDeals(token, properties.filter((p) => p !== missing));
      }
      throw new Error(`HubSpot deals fetch failed (${res.status}): ${body.slice(0, 200)}`);
    }
    const json = await res.json();
    out.push(...(json.results ?? []));
    after = json.paging?.next?.after;
  } while (after);
  return out;
}

function num(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function ts(v: unknown): number | undefined {
  if (!v) return undefined;
  const n = typeof v === "string" && /^\d+$/.test(v) ? Number(v) : Date.parse(String(v));
  return Number.isFinite(n) ? n : undefined;
}

function normalize(raw: Record<string, unknown>[], stages: PipelineStage[]): Deal[] {
  const stageById = new Map(stages.map((s) => [s.id, s]));
  const deals: Deal[] = [];
  for (const r of raw) {
    const p = (r as { properties?: Record<string, string | null> }).properties ?? {};
    if (p.pipeline !== PIPELINE_ID) continue;
    const id = String((r as { id: string }).id);
    const createdAt = ts(p.createdate);
    if (createdAt === undefined) continue;
    const stage = stageById.get(p.dealstage ?? "");
    const entered: Partial<Record<StageKey, number>> = { sal: createdAt };
    for (const [key, prop] of Object.entries(STAGE_ENTRY_PROPS) as [StageKey, string][]) {
      const v = ts(p[prop]);
      if (v !== undefined) entered[key] = v;
    }
    // first_pilot_date (workflow-set) wins; HubSpot's own stage-entry
    // timestamp covers everything else, including pre-workflow history.
    if (entered.pilot === undefined) {
      const v = ts(p[PILOT_ENTRY_FALLBACK_PROP]);
      if (v !== undefined) entered.pilot = v;
    }
    // Stage-skippers: reached a deeper stage without ever entering SQL —
    // count them as opps from their first deeper-stage entry.
    if (INFER_SKIPPED_SQL && entered.sql === undefined) {
      const deeper = [entered.deepdive, entered.pilot, entered.won].filter(
        (v): v is number => v !== undefined
      );
      if (deeper.length) entered.sql = Math.min(...deeper);
    }
    const amount = num(p.amount);
    deals.push({
      id,
      name: p.dealname || `Deal ${id}`,
      amount,
      value: amount ?? DEFAULT_DEAL_VALUE,
      stageId: p.dealstage ?? "unknown",
      stageLabel: stage?.label ?? p.dealstage ?? "Unknown",
      isOpen: stage ? !stage.isClosed : !["closedwon", "closedlost"].includes(p.dealstage ?? ""),
      entered,
      createdAt,
      hubspotUrl: dealUrl(id),
    });
  }
  return deals;
}

async function readDiskCache(): Promise<CacheShape | null> {
  try {
    return JSON.parse(await fs.readFile(CACHE_FILE, "utf8")) as CacheShape;
  } catch {
    return null;
  }
}

async function writeDiskCache(data: CacheShape): Promise<void> {
  try {
    await fs.mkdir(path.dirname(CACHE_FILE), { recursive: true });
    await fs.writeFile(CACHE_FILE, JSON.stringify(data));
  } catch {
    // cache persistence is best-effort
  }
}

export async function getDeals(opts: { force?: boolean } = {}): Promise<CacheShape> {
  const token = process.env.HUBSPOT_TOKEN;

  if (!token) {
    const { deals, pilotStageId } = demoDeals();
    return {
      payload: { deals, fetchedAt: Date.now(), source: "demo", pilotTracked: false },
      pilotStageId,
    };
  }

  if (!opts.force && memo && Date.now() - memo.at < CACHE_TTL_MS) return memo.data;

  try {
    const stages = await fetchPipelineStages(token);
    const props = [...BASE_PROPS, ...Object.values(STAGE_ENTRY_PROPS), PILOT_ENTRY_FALLBACK_PROP];
    const raw = await fetchAllDeals(token, props);
    const deals = normalize(raw, stages);
    const pilotStageId = stages.find((s) => PILOT_STAGE_MATCH.test(s.label))?.id ?? null;
    const data: CacheShape = {
      payload: {
        deals,
        fetchedAt: Date.now(),
        source: "live",
        pilotTracked: deals.some((d) => d.entered.pilot !== undefined),
      },
      pilotStageId,
    };
    memo = { at: Date.now(), data };
    void writeDiskCache(data);
    return data;
  } catch (err) {
    const fallback = memo?.data ?? (await readDiskCache());
    if (fallback) {
      return {
        ...fallback,
        payload: {
          ...fallback.payload,
          source: "cache",
          error: err instanceof Error ? err.message : String(err),
        },
      };
    }
    throw err;
  }
}
