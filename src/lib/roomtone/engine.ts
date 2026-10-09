import type { QlooCall, QlooEntity } from "../qloo/types";
import { affinity, insights, searchEntities } from "../qloo/client";
import { ROOMS, type Room } from "./catalog";

/* ------------------------------------------------------------------ */
/* Types                                                               */
/* ------------------------------------------------------------------ */

export type FitBand = "core" | "edge" | "outside" | "unmeasured";

export interface RoomAct {
  entity_id: string;
  name: string;
  affinity: number;
  rank: number;
  tags: { id: string; name: string; type: string }[];
  genres: string[];
  monthlyListeners?: number;
  /** Qloo's popularity percentile. Needed by the lift metric to remove the
   *  popularity bias otherwise baked into raw affinity. */
  popularity: number;
  disambiguation?: string;
}

/** The room's audience, expressed as the acts that most belong in it. */
export interface RoomProfile {
  room: Room;
  acts: RoomAct[];
  /** Affinity stats of the room's own top acts — the baseline every fit is measured against. */
  baseline: { n: number; min: number; max: number; mean: number; spread: number };
  /** Taste tags common across the room's acts, ranked by how many carry them. */
  tasteTags: { name: string; type: string; weight: number }[];
  unmeasured: boolean;
  calls: QlooCall[];
}

export interface ActProfile {
  entity_id: string;
  name: string;
  disambiguation?: string;
  popularity?: number;
  genres: string[];
  tags: { id: string; name: string; type: string }[];
  monthlyListeners?: number;
  similar: RoomAct[];
  description?: string;
  unmeasured: boolean;
  calls: QlooCall[];
}

export interface FitResult {
  roomId: string;
  actId: string;
  actName: string;
  roomName: string;
  /** Where the act lands inside the room's own top-acts distribution. */
  percentile: number | null;
  band: FitBand;
  /** Position among the room's top acts, when it appears at all. */
  rankInRoom: number | null;
  rawAffinity: number | null;
  /** Plain-language verdict. Never a sales prediction. */
  verdict: string;
  unmeasured: boolean;
  calls: QlooCall[];
}

export interface ScenePeer {
  room: Room;
  /** Acts that appear in both rooms' top-act lists — the actual evidence of overlap. */
  sharedActs: { id: string; name: string }[];
  /** Jaccard similarity over the two rooms' top-act sets, 0–1. */
  jaccard: number;
  unionSize: number;
}

/* ------------------------------------------------------------------ */
/* Internals                                                           */
/* ------------------------------------------------------------------ */

function labelsFor(entities: { entity_id: string; name: string }[], ids: string[]): Record<string, string> {
  const byId = new Map(entities.map((e) => [e.entity_id, e.name]));
  const out: Record<string, string> = {};
  for (const id of ids) {
    const name = byId.get(id);
    if (name) out[id] = name;
  }
  return out;
}

function tagsOf(e: QlooEntity) {
  // Qloo can return a bare `{type}` with no id/name. Drop those here too, so a
  // consumer can never crash on a malformed tag even from an uncached payload.
  return (e.tags ?? [])
    .filter((t) => typeof t.id === "string" && typeof t.name === "string")
    .map((t) => ({ id: t.id, name: t.name, type: t.type }));
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
function genresOf(e: QlooEntity): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  const add = (raw?: string) => {
    if (!raw) return;
    const name = raw.replace(/\s+/g, " ").trim();
    if (!name || name.length > 28) return;
    const key = name.toLowerCase().replace(/[^a-z0-9]+/g, "");
    if (!key || seen.has(key)) return;
    seen.add(key);
    out.push(name);
  };

  for (const g of e.properties?.primary_genres ?? []) add(g?.name);
  for (const t of e.tags ?? []) {
    if (!/^urn:tag:genre:music:/.test(t.id)) continue;
    add(t.name);
  }
  // Prefer distinct, headline-scale genres over micro-subgenres.
  return out.filter((g) => !/^(piano|saxophone|guitar|trumpet|bass|vocals|drums|percussion)$/i.test(g)).concat(
    out.filter((g) => /^(piano|saxophone|guitar|trumpet|bass|vocals|drums|percussion)$/i.test(g)),
  ).slice(0, 6);
}

function toRoomAct(e: QlooEntity, i: number): RoomAct {
  return {
    entity_id: e.entity_id,
    name: e.name,
    affinity: affinity(e) ?? 0,
    rank: i + 1,
    tags: tagsOf(e),
    genres: genresOf(e),
    monthlyListeners: e.properties?.external?.spotify?.[0]?.monthly_listeners,
    popularity: e.popularity ?? 0,
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
function distillTasteTags(acts: RoomAct[]): RoomProfile["tasteTags"] {
  const total = acts.reduce((s, a) => s + a.affinity, 0) || 1;
  const acc = new Map<string, { name: string; type: string; weight: number }>();
  const INTERESTING = /^urn:tag:(genre|audience|style|theme|subgenre|music|mood|artist|voice_type|obscularity):/;

  for (const act of acts) {
    const share = act.affinity / total;
    const seen = new Set<string>();
    for (const t of act.tags) {
      if (!INTERESTING.test(t.id)) continue;
      const family = t.type.split(":")[2] ?? t.type;
      const key = `${family}:${t.name.toLowerCase().replace(/[^a-z0-9]+/g, "")}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const cur = acc.get(key);
      if (cur) {
        cur.weight += share;
        // Keep the most readable casing we have seen.
        if (t.name.length < cur.name.length) cur.name = t.name;
      } else {
        acc.set(key, { name: t.name, type: t.type, weight: share });
      }
    }
  }

  // Two tags with the same normalised name are the same taste; keep the stronger.
  const byName = new Map<string, { name: string; type: string; weight: number }>();
  for (const t of acc.values()) {
    const key = t.name.toLowerCase().replace(/[^a-z0-9]+/g, "");
    const cur = byName.get(key);
    if (!cur || t.weight > cur.weight) byName.set(key, t);
  }

  const rank = (t: { weight: number; type: string }) =>
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

export async function getRoomProfile(roomId: string, take = TOP_N): Promise<RoomProfile> {
  const room = requireRoom(roomId);
  const calls: QlooCall[] = [];

  const res = await insights(
    "urn:entity:artist",
    { entities: [room.id] },
    {
      label: `${room.name} → acts that fill this room`,
      signalLabels: { [room.id]: room.name },
      take,
    },
  );
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
export async function getScenePeers(roomId: string, limit = 6): Promise<{ peers: ScenePeer[]; calls: QlooCall[] }> {
  const room = requireRoom(roomId);
  const calls: QlooCall[] = [];

  const near = await insights(
    "urn:entity:place",
    { entities: [room.id] },
    {
      label: `rooms culturally adjacent to ${room.name}`,
      signalLabels: { [room.id]: room.name },
      take: 12,
    },
  );
  calls.push(...near.calls);
  if (near.empty) return { peers: [], calls };

  const self = await getRoomProfile(roomId, TOP_N);
  calls.push(...self.calls);
  if (self.unmeasured) return { peers: [], calls };

  const mine = new Map(self.acts.map((a) => [a.entity_id, a.name]));
  const peers: ScenePeer[] = [];

  for (const c of near.entities.filter((e) => e.entity_id !== room.id).slice(0, 6)) {
    try {
      const theirs = await insights(
        "urn:entity:artist",
        { entities: [c.entity_id] },
        {
          label: `${c.name} → its own crowd`,
          signalLabels: { [c.entity_id]: c.name },
          take: TOP_N,
        },
      );
      calls.push(...theirs.calls);
      if (theirs.entities.length === 0) continue;

      const sharedActs: { id: string; name: string }[] = [];
      for (const a of theirs.entities) {
        const name = mine.get(a.entity_id);
        if (name) sharedActs.push({ id: a.entity_id, name });
      }

      const unionSize = self.acts.length + theirs.entities.length - sharedActs.length;
      // Even a single shared act is meaningful when the lists are 50 long, but a
      // room with a genuinely different crowd will share only one or two, so we
      // surface the count and let the reader judge rather than hiding it.
      if (sharedActs.length === 0) continue;

      peers.push({
        room: { id: c.entity_id, name: c.name, city: "", neighborhood: null, genre: null },
        sharedActs,
        jaccard: unionSize > 0 ? sharedActs.length / unionSize : 0,
        unionSize,
      });
    } catch {
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
export async function getFit(roomId: string, actId: string): Promise<FitResult> {
  const room = requireRoom(roomId);
  const calls: QlooCall[] = [];

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
      throw new Error(
        `Could not reach Qloo to measure ${actName ?? actId} against ${room.name} (${direct.failed}). Try again.`,
      );
    }
    raw = direct.affinity;
    if (direct.name) actName = direct.name;
  }
  if (!actName) actName = actId;

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

  const below = profile.acts.filter((a) => a.affinity <= raw!).length;
  const percentile = below / profile.acts.length;
  const band: FitBand = inRoom
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

function verdictFor(x: {
  band: FitBand;
  percentile: number | null;
  rankInRoom: number | null;
  roomName: string;
  actName: string;
}): string {
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
async function directAffinity(
  roomId: string,
  actId: string,
): Promise<{ affinity: number | null; name?: string; failed?: string; calls: QlooCall[] }> {
  const calls: QlooCall[] = [];
  try {
    const { qloo } = await import("../qloo/client");
    const { data, call } = await qloo<{ results?: { entities?: QlooEntity[] } }>(
      "/v2/insights",
      {
        "filter.type": "urn:entity:artist",
        "signal.interests.entities": roomId,
        "filter.results.entities": actId,
        take: 1,
      },
      { label: `affinity of one act to one room` },
    );
    calls.push(call);
    const e = data.results?.entities?.[0];
    if (!e) return { affinity: null, name: actId, calls };
    return { affinity: affinity(e), name: e.name, calls };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { affinity: null, failed: msg.slice(0, 120), calls };
  }
}

export async function getActProfile(actId: string): Promise<ActProfile> {
  const calls: QlooCall[] = [];

  // Qloo never echoes the signal entity back, so the act's own record is fetched
  // by pinning it as the requested result. Two traps here, both hit in
  // development: /search matches names rather than uuids, and passing the act as
  // *both* signal and pinned result returns nothing because Qloo excludes an
  // entity from its own results. So this call carries no signal at all.
  const self = await insights("urn:entity:artist", {}, { label: `${actId} → own record`, take: 1, pinResult: actId });
  calls.push(...self.calls);
  const record = self.entities[0];

  const near = await insights(
    "urn:entity:artist",
    { entities: [actId] },
    { label: `acts closest to ${record?.name ?? actId}`, take: 12 },
  );
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

/* ------------------------------------------------------------------ */
/* Sponsorship                                                         */
/* ------------------------------------------------------------------ */

export interface SponsorFit {
  actName: string;
  /** Brands whose audiences overlap this act's, strongest first. */
  brands: { id: string; name: string; affinity: number }[];
  /**
   * How trustworthy this list is.
   *
   * Brand affinity is measured cleanly from an *act* and poorly from a venue —
   * The Stone returns no brands at all, while Pier 36 returns a diffuse list.
   * So the list is only surfaced when it is tight enough to act on.
   */
  confidence: "high" | "low" | "none";
  calls: QlooCall[];
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
export async function getSponsorFit(actId: string, actName?: string): Promise<SponsorFit> {
  const res = await insights(
    "urn:entity:brand",
    { entities: [actId] },
    { label: `${actName ?? "act"} → sponsorable brand categories`, take: 12 },
  );

  const brands = res.entities
    .map((e) => ({ id: e.entity_id, name: e.name, affinity: affinity(e) ?? 0 }))
    .sort((a, b) => b.affinity - a.affinity);

  // A spread this wide means Qloo is returning "everything this audience ever
  // bought", which is not a sponsorship shortlist. Say so instead of padding.
  const spread = brands.length >= 2 ? brands[0]!.affinity - brands[brands.length - 1]!.affinity : 1;
  const confidence: SponsorFit["confidence"] =
    brands.length === 0 ? "none" : spread <= 0.09 ? "high" : "low";

  return { actName: actName ?? "", brands, confidence, calls: res.calls };
}

/* ------------------------------------------------------------------ */
/* Lookup helpers                                                      */
/* ------------------------------------------------------------------ */

const byId = new Map(ROOMS.map((r) => [r.id, r]));

export function requireRoom(roomId: string): Room {
  const r = byId.get(roomId);
  if (r) return r;
  // Allow ad-hoc rooms resolved at runtime (e.g. from search), kept minimal.
  if (/^[0-9A-F-]{36}$/i.test(roomId)) {
    return { id: roomId, name: "Selected room", city: "", neighborhood: null, genre: null };
  }
  throw new Error(`Unknown room: ${roomId}`);
}

export async function resolveRoom(query: string): Promise<{ room: Room; alternatives: Room[] } | null> {
  const { entities } = await searchEntities(query, "urn:entity:place", 6);
  if (!entities.length) return null;
  const toRoom = (e: QlooEntity): Room => ({
    id: e.entity_id,
    name: e.name,
    city: e.properties?.geocode?.city ?? "",
    neighborhood: e.properties?.neighborhood ?? null,
    genre: e.properties?.primary_genre?.name ?? null,
  });
  return { room: toRoom(entities[0]!), alternatives: entities.slice(1).map(toRoom) };
}

export interface ResolvedAct {
  id: string;
  name: string;
  disambiguation?: string;
  /**
   * How well Qloo's top hit actually matches what was typed.
   *
   * Qloo will happily resolve "Nate Barbrack" to "Nate Dogg". Silently showing
   * the wrong artist would corrupt every downstream fit, so a weak match is
   * surfaced for confirmation instead of being taken at face value.
   */
  match: "strong" | "weak";
  alternatives: { id: string; name: string; disambiguation?: string }[];
}

function normalise(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function matchQuality(query: string, candidate: string): ResolvedAct["match"] {
  const q = normalise(query).replace(/[^a-z0-9 ]/g, "");
  const c = normalise(candidate);
  if (!q || !c) return "weak";
  if (c === q || c.startsWith(`${q} `) || c.startsWith(q)) return "strong";
  const qs = new Set(q.split(" ").filter((w) => w.length > 1));
  const cs = new Set(c.split(" ").filter((w) => w.length > 1));
  const overlap = [...qs].filter((w) => cs.has(w)).length;
  return qs.size && overlap / qs.size >= 0.6 ? "strong" : "weak";
}

export async function resolveAct(query: string): Promise<ResolvedAct> {
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
export type { Room };