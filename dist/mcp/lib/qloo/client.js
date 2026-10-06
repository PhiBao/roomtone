import { randomUUID } from "node:crypto";
import { ResponseCache } from "./cache";
const KEY = process.env.QLOO_API_KEY;
const BASE = (process.env.QLOO_BASE_URL ?? "https://hackathon.api.qloo.com").replace(/\/+$/, "");
if (!KEY && process.env.NODE_ENV === "production" && !process.env.ROOMTONE_ALLOW_NO_KEY) {
    throw new Error("QLOO_API_KEY is required in production.");
}
const cache = new ResponseCache(process.env.ROOMTONE_CACHE_FILE);
export const qlooConfigured = Boolean(KEY);
export const qlooBaseUrl = BASE;
export class QlooError extends Error {
    status;
    path;
    body;
    constructor(message, status, path, body) {
        super(message);
        this.status = status;
        this.path = path;
        this.body = body;
        this.name = "QlooError";
    }
}
function redact(params) {
    const out = {};
    for (const [k, v] of Object.entries(params)) {
        if (v === undefined || v === null || v === "")
            continue;
        out[k] = typeof v === "string" ? v : JSON.stringify(v);
    }
    return out;
}
/**
 * Strip Qloo's response down to the fields Roomtone actually reads.
 *
 * Qloo entities carry ~60 tags each with alias lists in a dozen languages, plus
 * akas and verbose external blocks. Caching responses raw produced an 18MB file
 * for 169 calls, most of it never rendered. We slim before storing so the cache
 * stays small enough to ship in the container and the demo never pays for
 * parsing payload we ignore.
 */
function slim(data) {
    const results = data.results;
    const entities = results?.entities;
    if (!Array.isArray(entities))
        return data;
    const slimEntity = (e) => {
        if (!e || typeof e !== "object")
            return e;
        const src = e;
        const p = src.properties ?? {};
        const out = {
            entity_id: src.entity_id,
            name: src.name,
            subtype: src.subtype,
            popularity: src.popularity,
            disambiguation: src.disambiguation,
            query: src.query,
        };
        if (Array.isArray(src.tags)) {
            out.tags = src.tags.map((t) => ({
                id: t.id,
                name: t.name,
                type: t.type,
            }));
        }
        const props = {};
        for (const k of [
            "description",
            "address",
            "neighborhood",
            "website",
            "business_rating",
            "short_descriptions",
            "adjectives_for_fans",
            "adjectives_for_music",
        ]) {
            if (p[k] !== undefined)
                props[k] = p[k];
        }
        if (p.geocode) {
            const g = p.geocode;
            props.geocode = {
                name: g.name,
                city: g.city,
                admin1_region: g.admin1_region,
                country_code: g.country_code,
                metro: g.metro,
                latitude: g.latitude,
                longitude: g.longitude,
            };
        }
        if (p.primary_genre)
            props.primary_genre = { name: p.primary_genre.name, id: p.primary_genre.id };
        if (p.image?.url)
            props.image = { url: p.image.url };
        if (p.price_range)
            props.price_range = { currency: p.price_range.currency, min: p.price_range.min, max: p.price_range.max };
        if (p.primary_genres)
            props.primary_genres = p.primary_genres.slice(0, 8);
        if (p.external) {
            const x = p.external;
            const ext = {};
            if (Array.isArray(x.spotify) && x.spotify[0]) {
                ext.spotify = [{ id: x.spotify[0].id, followers: x.spotify[0].followers, monthly_listeners: x.spotify[0].monthly_listeners }];
            }
            if (Array.isArray(x.lastfm) && x.lastfm[0])
                ext.lastfm = [{ listeners: x.lastfm[0].listeners }];
            if (Array.isArray(x.imdb) && x.imdb[0])
                ext.imdb = [{ id: x.imdb[0].id }];
            if (Array.isArray(x.twitter) && x.twitter[0])
                ext.twitter = [{ id: x.twitter[0].id }];
            if (Object.keys(ext).length)
                props.external = ext;
        }
        if (Object.keys(props).length)
            out.properties = props;
        return out;
    };
    return { ...data, results: { ...results, entities: entities.map(slimEntity) } };
}
async function request(path, params, opts) {
    const safeParams = redact(params);
    const qs = new URLSearchParams(safeParams).toString();
    const url = `${BASE}${path}${qs ? `?${qs}` : ""}`;
    const method = opts.method ?? "GET";
    const started = Date.now();
    const headers = { Accept: "application/json" };
    if (KEY)
        headers["X-Api-Key"] = KEY;
    if (method === "POST")
        headers["Content-Type"] = "application/json";
    let res;
    try {
        res = await fetch(url, {
            method,
            headers,
            body: method === "POST" ? JSON.stringify(opts.body ?? {}) : undefined,
            signal: AbortSignal.timeout(45_000),
            cache: "no-store",
        });
    }
    catch (err) {
        throw new QlooError(`Qloo unreachable: ${err instanceof Error ? err.message : String(err)}`, 0, path);
    }
    const durationMs = Date.now() - started;
    const text = await res.text();
    if (!res.ok) {
        let msg = `Qloo ${res.status}`;
        try {
            const parsed = JSON.parse(text);
            msg = parsed.errors?.[0]?.message ?? parsed.message ?? msg;
        }
        catch {
            /* keep generic */
        }
        throw new QlooError(msg, res.status, path, text.slice(0, 400));
    }
    return { data: JSON.parse(text), durationMs, status: res.status };
}
function countResults(data) {
    const r = data.results;
    if (!r)
        return 0;
    for (const k of ["entities", "tags", "audiences", "trending"]) {
        const v = r[k];
        if (Array.isArray(v))
            return v.length;
    }
    return 0;
}
/**
 * The single audited entry point. Returns the parsed body plus the provenance
 * record that the Evidence panel renders. Everything Roomtone shows a number
 * from comes through here.
 */
export async function qloo(path, params = {}, opts = {}) {
    const key = ResponseCache.key(path, { ...params, _m: opts.method ?? "GET" });
    const hit = cache.get(key);
    if (hit?.fresh) {
        const data = hit.value;
        const rec = data;
        const existing = rec.__calls?.[0];
        return {
            data,
            call: existing
                ? { ...existing, cache: "hit", durationMs: 0 }
                : syntheticCall(path, redact(params), opts, "hit", 0, countResults(rec)),
        };
    }
    if (!KEY) {
        // Missing credential: fail loudly but with a useful message rather than a 500.
        if (hit)
            return { data: hit.value, call: syntheticCall(path, redact(params), opts, "stale", hit.ageMs, countResults(hit.value)) };
        throw new QlooError("QLOO_API_KEY is not configured.", 401, path);
    }
    let lastErr;
    for (let attempt = 0; attempt < 5; attempt++) {
        try {
            const { data, durationMs, status } = await request(path, params, opts);
            const call = syntheticCall(path, redact(params), opts, "miss", durationMs, countResults(data), status);
            const withCalls = { ...slim(data), __calls: [call] };
            cache.set(key, withCalls);
            return { data: withCalls, call };
        }
        catch (err) {
            lastErr = err;
            const status = err instanceof QlooError ? err.status : 0;
            // 4xx other than 429 are deterministic — retrying just burns quota.
            if (status >= 400 && status < 500 && status !== 429)
                break;
            if (attempt < 4) {
                // Qloo rate limits are bursty; back off hard rather than hammering.
                const backoff = Math.min(9000, 700 * 2 ** attempt) + Math.random() * 400;
                await new Promise((r) => setTimeout(r, backoff));
            }
        }
    }
    if (hit) {
        // Serve stale rather than fail the demo. The Evidence panel shows the age.
        return { data: hit.value, call: syntheticCall(path, redact(params), opts, "stale", hit.ageMs, countResults(hit.value)) };
    }
    throw lastErr;
}
function syntheticCall(path, params, opts, cacheState, durationMs, resultCount, status = 200) {
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
export async function searchEntities(query, types, limit = 6) {
    const { data, call } = await qloo("/search", { query, types, limit }, { label: `resolve “${query}”` });
    return { entities: data.results ?? [], call };
}
function toEntities(data) {
    return data.results?.entities ?? [];
}
export function affinity(e) {
    const v = e?.query?.affinity;
    return typeof v === "number" ? v : null;
}
/**
 * `/v2/insights` — the workhorse. One entity in, a ranked list out.
 *
 * Note: Qloo returns HTTP 400 with "All of the provided signal.interests.entities
 * were invalid" when the signal entity simply has no taste coverage. That is a
 * real, meaningful state (the room is not measured), so it is surfaced as
 * `empty` rather than thrown away.
 */
export async function insights(filterType, signal, opts = {}) {
    const params = {
        "filter.type": filterType,
        take: opts.take ?? 20,
        page: opts.page ?? 1,
    };
    if (signal.entities?.length)
        params["signal.interests.entities"] = signal.entities.join(",");
    if (signal.tags?.length)
        params["signal.interests.tags"] = signal.tags.join(",");
    if (signal.audiences?.length)
        params["signal.demographics.audiences"] = signal.audiences.join(",");
    if (signal.age)
        params["signal.demographics.age"] = signal.age;
    if (signal.gender)
        params["signal.demographics.gender"] = signal.gender;
    if (opts.exclude?.length)
        params["filter.exclude.entities"] = opts.exclude.join(",");
    if (opts.popularityMin !== undefined)
        params["filter.popularity.min"] = opts.popularityMin;
    if (opts.pinResult)
        params["filter.results.entities"] = opts.pinResult;
    try {
        const { data, call } = await qloo("/v2/insights", params, { label: opts.label, signalLabels: opts.signalLabels });
        return { entities: toEntities(data), calls: [call] };
    }
    catch (err) {
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
export async function compare(aEntities, bEntities, filterType = "urn:tag") {
    const { data, call } = await qloo("/v2/analysis/compare", {
        "a.signal.interests.entities": aEntities.join(","),
        "b.signal.interests.entities": bEntities.join(","),
        "filter.type": filterType,
    }, { label: `compare ${aEntities.length}×${bEntities.length} signal(s)` });
    const tags = data.results?.tags ?? [];
    const nameOf = (x) => ({
        tag_id: x.tag_id ?? "",
        name: x.name ?? "",
        subtype: x.subtype,
    });
    // Qloo returns `tags` (shared), `a` (only A) and `b` (only B) as separate lists.
    const aSide = (data.results?.a ?? []);
    const bSide = (data.results?.b ?? []);
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
