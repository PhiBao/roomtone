import { randomUUID } from "node:crypto";
import { ResponseCache } from "./cache";
import type { QlooCall, QlooEntity, InsightsResult } from "./types";

const KEY = process.env.QLOO_API_KEY;
const BASE = (process.env.QLOO_BASE_URL ?? "https://hackathon.api.qloo.com").replace(/\/+$/, "");

if (!KEY && process.env.NODE_ENV === "production" && !process.env.ROOMTONE_ALLOW_NO_KEY) {
  throw new Error("QLOO_API_KEY is required in production.");
}

const cache = new ResponseCache(process.env.ROOMTONE_CACHE_FILE);

export const qlooConfigured = Boolean(KEY);
export const qlooBaseUrl = BASE;

export class QlooError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly path: string,
    readonly body?: string,
  ) {
    super(message);
    this.name = "QlooError";
  }
}

interface DoOptions {
  method?: "GET" | "POST";
  body?: unknown;
  /** Human label recorded in provenance, e.g. "The Stone → top acts". */
  label?: string;
  signalIds?: string[];
  signalLabels?: Record<string, string>;
}

function redact(params: Record<string, unknown>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null || v === "") continue;
    out[k] = typeof v === "string" ? v : JSON.stringify(v);
  }
  return out;
}

async function request(path: string, params: Record<string, unknown>, opts: DoOptions) {
  const safeParams = redact(params);
  const qs = new URLSearchParams(safeParams).toString();
  const url = `${BASE}${path}${qs ? `?${qs}` : ""}`;
  const method = opts.method ?? "GET";

  const started = Date.now();
  const headers: Record<string, string> = { Accept: "application/json" };
  if (KEY) headers["X-Api-Key"] = KEY;
  if (method === "POST") headers["Content-Type"] = "application/json";

  let res: Response;
  try {
    res = await fetch(url, {
      method,
      headers,
      body: method === "POST" ? JSON.stringify(opts.body ?? {}) : undefined,
      signal: AbortSignal.timeout(45_000),
      cache: "no-store",
    });
  } catch (err) {
    throw new QlooError(
      `Qloo unreachable: ${err instanceof Error ? err.message : String(err)}`,
      0,
      path,
    );
  }

  const durationMs = Date.now() - started;
  const text = await res.text();

  if (!res.ok) {
    let msg = `Qloo ${res.status}`;
    try {
      const parsed = JSON.parse(text) as { errors?: { message?: string }[]; message?: string };
      msg = parsed.errors?.[0]?.message ?? parsed.message ?? msg;
    } catch {
      /* keep generic */
    }
    throw new QlooError(msg, res.status, path, text.slice(0, 400));
  }

  return { data: JSON.parse(text) as Record<string, unknown>, durationMs, status: res.status };
}

function countResults(data: Record<string, unknown>): number {
  const r = data.results as Record<string, unknown> | undefined;
  if (!r) return 0;
  for (const k of ["entities", "tags", "audiences", "trending"]) {
    const v = r[k];
    if (Array.isArray(v)) return v.length;
  }
  return 0;
}

/**
 * The single audited entry point. Returns the parsed body plus the provenance
 * record that the Evidence panel renders. Everything Roomtone shows a number
 * from comes through here.
 */
export async function qloo<T = Record<string, unknown>>(
  path: string,
  params: Record<string, unknown> = {},
  opts: DoOptions = {},
): Promise<{ data: T; call: QlooCall }> {
  const key = ResponseCache.key(path, { ...params, _m: opts.method ?? "GET" });
  const hit = cache.get<T>(key);

  if (hit?.fresh) {
    const data = hit.value as T;
    const rec = data as unknown as Record<string, unknown>;
    const existing = (rec as { __calls?: QlooCall[] }).__calls?.[0];
    return {
      data,
      call: existing
        ? { ...existing, cache: "hit", durationMs: 0 }
        : syntheticCall(path, redact(params), opts, "hit", 0, countResults(rec)),
    };
  }

  if (!KEY) {
    // Missing credential: fail loudly but with a useful message rather than a 500.
    if (hit) return { data: hit.value as T, call: syntheticCall(path, redact(params), opts, "stale", hit.ageMs, countResults(hit.value as never)) };
    throw new QlooError("QLOO_API_KEY is not configured.", 401, path);
  }

  let lastErr: unknown;
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      const { data, durationMs, status } = await request(path, params, opts);
      const call = syntheticCall(path, redact(params), opts, "miss", durationMs, countResults(data), status);
      const withCalls = { ...data, __calls: [call] };
      cache.set(key, withCalls);
      return { data: withCalls as T, call };
    } catch (err) {
      lastErr = err;
      const status = err instanceof QlooError ? err.status : 0;
      // 4xx other than 429 are deterministic — retrying just burns quota.
      if (status >= 400 && status < 500 && status !== 429) break;
      if (attempt < 4) {
        // Qloo rate limits are bursty; back off hard rather than hammering.
        const backoff = Math.min(9000, 700 * 2 ** attempt) + Math.random() * 400;
        await new Promise((r) => setTimeout(r, backoff));
      }
    }
  }

  if (hit) {
    // Serve stale rather than fail the demo. The Evidence panel shows the age.
    return { data: hit.value as T, call: syntheticCall(path, redact(params), opts, "stale", hit.ageMs, countResults(hit.value as never)) };
  }
  throw lastErr;
}

function syntheticCall(
  path: string,
  params: Record<string, string>,
  opts: DoOptions,
  cacheState: QlooCall["cache"],
  durationMs: number,
  resultCount: number,
  status = 200,
): QlooCall {
  return {
    id: randomUUID(),
    at: new Date().toISOString(),
    method: opts.method ?? "GET",
    path,
    params,
    status,
    durationMs,
    resultCount,
    cache: cacheState,
    labels: opts.signalLabels,
    note: opts.label,
  };
}

/* ------------------------------------------------------------------ */
/* Typed convenience wrappers                                          */
/* ------------------------------------------------------------------ */

export async function searchEntities(
  query: string,
  types: string,
  limit = 6,
): Promise<{ entities: QlooEntity[]; call: QlooCall }> {
  const { data, call } = await qloo<{ results?: QlooEntity[] }>(
    "/search",
    { query, types, limit },
    { label: `resolve “${query}”` },
  );
  return { entities: data.results ?? [], call };
}

function toEntities(data: { results?: { entities?: QlooEntity[] } }): QlooEntity[] {
  return data.results?.entities ?? [];
}

export function affinity(e: QlooEntity | undefined): number | null {
  const v = e?.query?.affinity;
  return typeof v === "number" ? v : null;
}

export interface InsightsOptions {
  label?: string;
  signalLabels?: Record<string, string>;
  exclude?: string[];
  take?: number;
  page?: number;
  popularityMin?: number;
  /** Request one specific entity back as the single result (`filter.results.entities`). */
  pinResult?: string;
}

/**
 * `/v2/insights` — the workhorse. One entity in, a ranked list out.
 *
 * Note: Qloo returns HTTP 400 with "All of the provided signal.interests.entities
 * were invalid" when the signal entity simply has no taste coverage. That is a
 * real, meaningful state (the room is not measured), so it is surfaced as
 * `empty` rather than thrown away.
 */
export async function insights(
  filterType: string,
  signal: { entities?: string[]; tags?: string[]; audiences?: string[]; age?: string; gender?: string },
  opts: InsightsOptions = {},
): Promise<InsightsResult> {
  const params: Record<string, unknown> = {
    "filter.type": filterType,
    take: opts.take ?? 20,
    page: opts.page ?? 1,
  };
  if (signal.entities?.length) params["signal.interests.entities"] = signal.entities.join(",");
  if (signal.tags?.length) params["signal.interests.tags"] = signal.tags.join(",");
  if (signal.audiences?.length) params["signal.demographics.audiences"] = signal.audiences.join(",");
  if (signal.age) params["signal.demographics.age"] = signal.age;
  if (signal.gender) params["signal.demographics.gender"] = signal.gender;
  if (opts.exclude?.length) params["filter.exclude.entities"] = opts.exclude.join(",");
  if (opts.popularityMin !== undefined) params["filter.popularity.min"] = opts.popularityMin;
  if (opts.pinResult) params["filter.results.entities"] = opts.pinResult;

  try {
    const { data, call } = await qloo<{ results?: { entities?: QlooEntity[] } }>(
      "/v2/insights",
      params,
      { label: opts.label, signalLabels: opts.signalLabels },
    );
    return { entities: toEntities(data), calls: [call] };
  } catch (err) {
    if (err instanceof QlooError && err.status === 400 && /invalid|valid signal/i.test(err.message)) {
      return { entities: [], calls: [], empty: true };
    }
    throw err;
  }
}

/**
 * `/v2/analysis/compare` — the shared taste space between two signals.
 *
 * This is what separates "these two things are both popular" from "these two
 * things attract the same people". Used for the room-vs-room scene overlap.
 */
export async function compare(
  aEntities: string[],
  bEntities: string[],
  filterType = "urn:tag",
): Promise<{
  shared: { tag_id: string; name: string; subtype?: string; score: number }[];
  onlyA: { tag_id: string; name: string; subtype?: string }[];
  onlyB: { tag_id: string; name: string; subtype?: string }[];
  call: QlooCall;
}> {
  const { data, call } = await qloo<{
    results?: {
      tags?: { tag_id: string; name: string; subtype?: string; query?: { score?: number } }[];
      a?: unknown[];
      b?: unknown[];
    };
  }>(
    "/v2/analysis/compare",
    {
      "a.signal.interests.entities": aEntities.join(","),
      "b.signal.interests.entities": bEntities.join(","),
      "filter.type": filterType,
    },
    { label: `compare ${aEntities.length}×${bEntities.length} signal(s)` },
  );

  const tags = data.results?.tags ?? [];
  const nameOf = (x: { tag_id?: string; name?: string; subtype?: string }) => ({
    tag_id: x.tag_id ?? "",
    name: x.name ?? "",
    subtype: x.subtype,
  });

  // Qloo returns `tags` (shared), `a` (only A) and `b` (only B) as separate lists.
  const aSide = (data.results?.a ?? []) as { tag_id?: string; name?: string; subtype?: string; query?: { score?: number } }[];
  const bSide = (data.results?.b ?? []) as { tag_id?: string; name?: string; subtype?: string; query?: { score?: number } }[];

  return {
    shared: tags
      .map((t) => ({ ...nameOf(t), score: t.query?.score ?? 0 }))
      .sort((x, y) => y.score - x.score),
    onlyA: aSide.map(nameOf),
    onlyB: bSide.map(nameOf),
    call,
  };
}

export function cacheStats() {
  return { entries: cache.size };
}

export function flushCache() {
  cache.flush();
}