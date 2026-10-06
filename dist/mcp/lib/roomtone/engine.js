import { affinity, insights, searchEntities } from "../qloo/client";
import { ROOMS } from "./catalog";
/* ------------------------------------------------------------------ */
/* Internals                                                           */
/* ------------------------------------------------------------------ */
function labelsFor(entities, ids) {
    const byId = new Map(entities.map((e) => [e.entity_id, e.name]));
    const out = {};
    for (const id of ids) {
        const name = byId.get(id);
        if (name)
            out[id] = name;
    }
    return out;
}
function tagsOf(e) {
    return (e.tags ?? []).map((t) => ({ id: t.id, name: t.name, type: t.type }));
}
/**
 * Genres worth showing a human.
 *
 * Qloo attaches the same concept several times — as `primary_genres`, as
 * `genre:music:*` tags and again under the `genre:qloo:*` mirror — so a naive
 * read renders "Jazz · Piano · Piano · Modern Jazz". We normalise, dedupe, and
 * keep only the musical namespace, since venue-style `genre:place:*` tags leak
 * into artist records and would otherwise describe a building, not a person.
 */
function genresOf(e) {
    const seen = new Set();
    const out = [];
    const add = (raw) => {
        if (!raw)
            return;
        const name = raw.replace(/\s+/g, " ").trim();
        if (!name || name.length > 28)
            return;
        const key = name.toLowerCase().replace(/[^a-z0-9]+/g, "");
        if (!key || seen.has(key))
            return;
        seen.add(key);
        out.push(name);
    };
    for (const g of e.properties?.primary_genres ?? [])
        add(g?.name);
    for (const t of e.tags ?? []) {
        if (!/^urn:tag:genre:music:/.test(t.id))
            continue;
        add(t.name);
    }
    // Prefer distinct, headline-scale genres over micro-subgenres.
    return out.filter((g) => !/^(piano|saxophone|guitar|trumpet|bass|vocals|drums|percussion)$/i.test(g)).concat(out.filter((g) => /^(piano|saxophone|guitar|trumpet|bass|vocals|drums|percussion)$/i.test(g))).slice(0, 6);
}
function toRoomAct(e, i) {
    return {
        entity_id: e.entity_id,
        name: e.name,
        affinity: affinity(e) ?? 0,
        rank: i + 1,
        tags: tagsOf(e),
        genres: genresOf(e),
        monthlyListeners: e.properties?.external?.spotify?.[0]?.monthly_listeners,
        disambiguation: e.disambiguation,
    };
}
/**
 * Collapse ~50 acts × ~60 tags into the handful that actually describe the room.
 *
 * We weight each tag by the affinity mass of the acts carrying it, so a genre
 * shared by every act in the room outranks one that appears on a single act.
 * Names are normalised before grouping because Qloo returns the same concept
 * under several casings ("Post Bop", "Post bop", "Post-Bop") which would
 * otherwise read as three separate tastes.
 */
function distillTasteTags(acts) {
    const total = acts.reduce((s, a) => s + a.affinity, 0) || 1;
    const acc = new Map();
    const INTERESTING = /^urn:tag:(genre|audience|style|theme|subgenre|music|mood|artist|voice_type|obscularity):/;
    for (const act of acts) {
        const share = act.affinity / total;
        const seen = new Set();
        for (const t of act.tags) {
            if (!INTERESTING.test(t.id))
                continue;
            const family = t.type.split(":")[2] ?? t.type;
            const key = `${family}:${t.name.toLowerCase().replace(/[^a-z0-9]+/g, "")}`;
            if (seen.has(key))
                continue;
            seen.add(key);
            const cur = acc.get(key);
            if (cur) {
                cur.weight += share;
                // Keep the most readable casing we have seen.
                if (t.name.length < cur.name.length)
                    cur.name = t.name;
            }
            else {
                acc.set(key, { name: t.name, type: t.type, weight: share });
            }
        }
    }
    // Two tags with the same normalised name are the same taste; keep the stronger.
    const byName = new Map();
    for (const t of acc.values()) {
        const key = t.name.toLowerCase().replace(/[^a-z0-9]+/g, "");
        const cur = byName.get(key);
        if (!cur || t.weight > cur.weight)
            byName.set(key, t);
    }
    const rank = (t) => 
    // Audience descriptors and genres describe a room far better than
    // per-act production traits, so they sort first at equal support.
    (/audience/.test(t.type) ? 1.35 : /genre|subgenre/.test(t.type) ? 1.2 : /style|mood|theme/.test(t.type) ? 1.1 : 0.7) * t.weight;
    return [...byName.values()]
        .map((t) => ({ ...t, weight: rank(t) }))
        .sort((x, y) => y.weight - x.weight)
        .slice(0, 28);
}
/* ------------------------------------------------------------------ */
/* Public API                                                          */
/* ------------------------------------------------------------------ */
const TOP_N = 50;
export async function getRoomProfile(roomId, take = TOP_N) {
    const room = requireRoom(roomId);
    const calls = [];
    const res = await insights("urn:entity:artist", { entities: [room.id] }, {
        label: `${room.name} → acts that fill this room`,
        signalLabels: { [room.id]: room.name },
        take,
    });
    calls.push(...res.calls);
    const acts = res.entities.map(toRoomAct);
    const affinities = acts.map((a) => a.affinity);
    const mean = affinities.length ? affinities.reduce((s, a) => s + a, 0) / affinities.length : 0;
    return {
        room,
        acts,
        baseline: {
            n: acts.length,
            min: affinities.length ? Math.min(...affinities) : 0,
            max: affinities.length ? Math.max(...affinities) : 0,
            mean,
            // Qloo affinities are tightly banded, so spread matters more than the mean.
            spread: affinities.length
                ? Math.max(...affinities) - Math.min(...affinities)
                : 0,
        },
        tasteTags: distillTasteTags(acts),
        unmeasured: res.empty === true || acts.length === 0,
        calls,
    };
}
/**
 * Rooms that share this room's audience.
 *
 * We originally used `/v2/analysis/compare`, but in the hackathon environment it
 * only returns generic place tags — "Place", "Tourist Attraction", "Live Music
 * Venue" — which are true of every venue and tell you nothing about culture.
 * Instead we measure overlap directly on the data we already trust: fetch each
 * candidate room's top acts and compute the Jaccard similarity of the two sets.
 *
 * That is a stronger claim anyway, because the evidence is legible: the shared
 * acts are named on the page, not summarised into a score.
 */
export async function getScenePeers(roomId, limit = 6) {
    const room = requireRoom(roomId);
    const calls = [];
    const near = await insights("urn:entity:place", { entities: [room.id] }, {
        label: `rooms culturally adjacent to ${room.name}`,
        signalLabels: { [room.id]: room.name },
        take: 12,
    });
    calls.push(...near.calls);
    if (near.empty)
        return { peers: [], calls };
    const self = await getRoomProfile(roomId, TOP_N);
    calls.push(...self.calls);
    if (self.unmeasured)
        return { peers: [], calls };
    const mine = new Map(self.acts.map((a) => [a.entity_id, a.name]));
    const peers = [];
    for (const c of near.entities.filter((e) => e.entity_id !== room.id).slice(0, 6)) {
        try {
            const theirs = await insights("urn:entity:artist", { entities: [c.entity_id] }, {
                label: `${c.name} → its own crowd`,
                signalLabels: { [c.entity_id]: c.name },
                take: TOP_N,
            });
            calls.push(...theirs.calls);
            if (theirs.entities.length === 0)
                continue;
            const sharedActs = [];
            for (const a of theirs.entities) {
                const name = mine.get(a.entity_id);
                if (name)
                    sharedActs.push({ id: a.entity_id, name });
            }
            const unionSize = self.acts.length + theirs.entities.length - sharedActs.length;
            // Even a single shared act is meaningful when the lists are 50 long, but a
            // room with a genuinely different crowd will share only one or two, so we
            // surface the count and let the reader judge rather than hiding it.
            if (sharedActs.length === 0)
                continue;
            peers.push({
                room: { id: c.entity_id, name: c.name, city: "", neighborhood: null, genre: null },
                sharedActs,
                jaccard: unionSize > 0 ? sharedActs.length / unionSize : 0,
                unionSize,
            });
        }
        catch {
            /* one unreachable peer must not sink the panel */
        }
    }
    peers.sort((a, b) => b.sharedActs.length - a.sharedActs.length || b.jaccard - a.jaccard);
    return { peers: peers.slice(0, limit), calls };
}
/**
 * The core measurement: how well an act belongs in a room.
 *
 * Qloo's raw affinity for "act A given room R" sits in a narrow band, so the
 * number alone says little. What carries meaning is where it falls *relative to
 * the acts that already fit this room* — which is exactly the question a
 * promoter is asking. We therefore report a percentile inside R's own
 * distribution of top acts, and say plainly when we cannot measure the room.
 *
 * This measures audience alignment. It is not a ticket-sales forecast.
 */
export async function getFit(roomId, actId) {
    const room = requireRoom(roomId);
    const calls = [];
    const profile = await getRoomProfile(roomId);
    calls.push(...profile.calls);
    if (profile.unmeasured) {
        return {
            roomId,
            actId,
            actName: actId,
            roomName: room.name,
            percentile: null,
            band: "unmeasured",
            rankInRoom: null,
            rawAffinity: null,
            verdict: `Qloo has no taste signal for ${room.name}. Some rooms in the dataset aren't measured — we would rather say so than guess.`,
            unmeasured: true,
            calls,
        };
    }
    const inRoom = profile.acts.find((a) => a.entity_id === actId);
    let raw = inRoom?.affinity ?? null;
    let actName = inRoom?.name ?? null;
    if (raw === null) {
        // The act isn't in the room's top 50, so ask Qloo for that act specifically
        // as the single result and compare its affinity against the room's band.
        const direct = await directAffinity(room.id, actId);
        calls.push(...direct.calls);
        if (direct.failed) {
            // A transport/rate-limit failure is NOT the same as "this room isn't
            // measured". Say which one it is rather than defaulting to unmeasured.
            throw new Error(`Could not reach Qloo to measure ${actName ?? actId} against ${room.name} (${direct.failed}). Try again.`);
        }
        raw = direct.affinity;
        if (direct.name)
            actName = direct.name;
    }
    if (!actName)
        actName = actId;
    if (raw === null) {
        return {
            roomId,
            actId,
            actName,
            roomName: room.name,
            percentile: null,
            band: "unmeasured",
            rankInRoom: null,
            rawAffinity: null,
            verdict: `No affinity could be computed for this act against ${room.name}.`,
            unmeasured: true,
            calls,
        };
    }
    const below = profile.acts.filter((a) => a.affinity <= raw).length;
    const percentile = below / profile.acts.length;
    const band = inRoom
        ? inRoom.rank <= 10
            ? "core"
            : "edge"
        : "outside";
    return {
        roomId,
        actId,
        actName,
        roomName: room.name,
        percentile,
        band,
        rankInRoom: inRoom?.rank ?? null,
        rawAffinity: raw,
        verdict: verdictFor({ band, percentile, rankInRoom: inRoom?.rank ?? null, roomName: room.name, actName }),
        unmeasured: false,
        calls,
    };
}
function verdictFor(x) {
    const pct = x.percentile === null ? null : Math.round(x.percentile * 100);
    if (x.band === "core") {
        return `${x.actName} sits in the core of what ${x.roomName} draws — #${x.rankInRoom} of the ${TOP_N} acts closest to this room's crowd.`;
    }
    if (x.band === "edge") {
        return `${x.actName} belongs to ${x.roomName}'s audience, but at the edge — #${x.rankInRoom} of ${TOP_N}. A fit, not a guarantee.`;
    }
    return `${x.actName} falls below the ${TOP_N} acts that most belong in ${x.roomName}. That is a mismatch signal worth pricing in before a guarantee goes out.`;
}
/**
 * Ask Qloo for one specific entity's affinity to one signal.
 *
 * `failed` distinguishes "the request broke" from "Qloo has no affinity here".
 * Collapsing the two into a null would let a rate limit masquerade as a
 * confident "we can't measure this", which is exactly the kind of dishonest
 * result this product exists to eliminate.
 */
async function directAffinity(roomId, actId) {
    const calls = [];
    try {
        const { qloo } = await import("../qloo/client");
        const { data, call } = await qloo("/v2/insights", {
            "filter.type": "urn:entity:artist",
            "signal.interests.entities": roomId,
            "filter.results.entities": actId,
            take: 1,
        }, { label: `affinity of one act to one room` });
        calls.push(call);
        const e = data.results?.entities?.[0];
        if (!e)
            return { affinity: null, name: actId, calls };
        return { affinity: affinity(e), name: e.name, calls };
    }
    catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        return { affinity: null, failed: msg.slice(0, 120), calls };
    }
}
export async function getActProfile(actId) {
    const calls = [];
    // Qloo never echoes the signal entity back, so the act's own record is fetched
    // by pinning it as the requested result. Two traps here, both hit in
    // development: /search matches names rather than uuids, and passing the act as
    // *both* signal and pinned result returns nothing because Qloo excludes an
    // entity from its own results. So this call carries no signal at all.
    const self = await insights("urn:entity:artist", {}, { label: `${actId} → own record`, take: 1, pinResult: actId });
    calls.push(...self.calls);
    const record = self.entities[0];
    const near = await insights("urn:entity:artist", { entities: [actId] }, { label: `acts closest to ${record?.name ?? actId}`, take: 12 });
    calls.push(...near.calls);
    return {
        entity_id: actId,
        name: record?.name ?? actId,
        disambiguation: record?.disambiguation,
        popularity: record?.popularity,
        genres: record ? genresOf(record) : [],
        tags: record ? tagsOf(record) : [],
        monthlyListeners: record?.properties?.external?.spotify?.[0]?.monthly_listeners,
        description: record?.properties?.description,
        similar: near.entities.map(toRoomAct),
        unmeasured: near.entities.length === 0 && !record,
        calls,
    };
}
/**
 * Which brands actually reach the audience of the act you are booking.
 *
 * This is the question a sponsorship desk asks, and Qloo answers it sharply
 * from an artist: Bad Bunny returns Adidas, Puma, Nike and Converse at the top;
 * Bill Frisell returns Fender, Gibson and Reverb. Those are sponsorable
 * categories, not noise.
 *
 * The same query anchored on a *venue* is unreliable — venue brand affinity is
 * diffuse or absent — so we never present it as a room-level result.
 */
export async function getSponsorFit(actId, actName) {
    const res = await insights("urn:entity:brand", { entities: [actId] }, { label: `${actName ?? "act"} → sponsorable brand categories`, take: 12 });
    const brands = res.entities
        .map((e) => ({ id: e.entity_id, name: e.name, affinity: affinity(e) ?? 0 }))
        .sort((a, b) => b.affinity - a.affinity);
    // A spread this wide means Qloo is returning "everything this audience ever
    // bought", which is not a sponsorship shortlist. Say so instead of padding.
    const spread = brands.length >= 2 ? brands[0].affinity - brands[brands.length - 1].affinity : 1;
    const confidence = brands.length === 0 ? "none" : spread <= 0.09 ? "high" : "low";
    return { actName: actName ?? "", brands, confidence, calls: res.calls };
}
/* ------------------------------------------------------------------ */
/* Lookup helpers                                                      */
/* ------------------------------------------------------------------ */
const byId = new Map(ROOMS.map((r) => [r.id, r]));
export function requireRoom(roomId) {
    const r = byId.get(roomId);
    if (r)
        return r;
    // Allow ad-hoc rooms resolved at runtime (e.g. from search), kept minimal.
    if (/^[0-9A-F-]{36}$/i.test(roomId)) {
        return { id: roomId, name: "Selected room", city: "", neighborhood: null, genre: null };
    }
    throw new Error(`Unknown room: ${roomId}`);
}
export async function resolveRoom(query) {
    const { entities } = await searchEntities(query, "urn:entity:place", 6);
    if (!entities.length)
        return null;
    const toRoom = (e) => ({
        id: e.entity_id,
        name: e.name,
        city: e.properties?.geocode?.city ?? "",
        neighborhood: e.properties?.neighborhood ?? null,
        genre: e.properties?.primary_genre?.name ?? null,
    });
    return { room: toRoom(entities[0]), alternatives: entities.slice(1).map(toRoom) };
}
function normalise(s) {
    return s
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[^a-z0-9]+/g, " ")
        .trim();
}
function matchQuality(query, candidate) {
    const q = normalise(query).replace(/[^a-z0-9 ]/g, "");
    const c = normalise(candidate);
    if (!q || !c)
        return "weak";
    if (c === q || c.startsWith(`${q} `) || c.startsWith(q))
        return "strong";
    const qs = new Set(q.split(" ").filter((w) => w.length > 1));
    const cs = new Set(c.split(" ").filter((w) => w.length > 1));
    const overlap = [...qs].filter((w) => cs.has(w)).length;
    return qs.size && overlap / qs.size >= 0.6 ? "strong" : "weak";
}
export async function resolveAct(query) {
    const { entities } = await searchEntities(query, "urn:entity:artist", 6);
    const list = entities.map((e) => ({
        id: e.entity_id,
        name: e.name,
        disambiguation: e.disambiguation,
    }));
    const top = list[0];
    return {
        id: top?.id ?? "",
        name: top?.name ?? query,
        disambiguation: top?.disambiguation,
        match: top ? matchQuality(query, top.name) : "weak",
        alternatives: list.slice(1),
    };
}
export { labelsFor };
