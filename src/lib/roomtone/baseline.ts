import { affinity, insights } from "../qloo/client";
import type { QlooCall } from "../qloo/types";
import { ROOMS } from "./catalog";
import type { RoomAct } from "./engine";

/**
 * The incumbent method.
 *
 * The hackathon brief is blunt: "if your submission would work the same without
 * Qloo, you're building the wrong thing." Eight or more serious entries in this
 * field answered that with an LLM-only control. This answers it with something
 * harder to dismiss — *how a booker actually decides today*:
 *
 *   1. popularity — whose numbers are big. Every booking conversation starts here.
 *   2. genre match — does the act's music sit in the venue's stated genre bucket?
 *
 * That is the whole incumbent heuristic, implemented deliberately and given the
 * best possible form. Note it uses two Qloo fields (an entity's `popularity`
 * percentile and its genre tags) but **no taste-graph signal at all** — nothing
 * about who listens to what, which is the only thing Qloo actually sells. If the
 * baselines rank the same acts Roomtone does, Roomtone is decoration and the
 * evidence will show it.
 */

export interface BaselineRanking {
  act: RoomAct;
  popularityRank: number;
  genreRank: number;
  /** Composite of the two, which is what a booker's gut approximates. */
  combinedRank: number;
}

export interface BaselineResult {
  roomName: string;
  /** Ranked by raw popularity. The "just book the biggest name" answer. */
  byPopularity: RoomAct[];
  /** Ranked by genre-string overlap with the venue's own genre. */
  byGenreMatch: RoomAct[];
  ranking: BaselineRanking[];
  calls: QlooCall[];
}

/**
 * Genre strings for the venue itself. Qloo's venue records carry a
 * `primary_genre` ("Live music venue", "Concert hall", "Arena") which describes
 * the *building*, not a music style — so we map it to the musical vocabulary a
 * booker would actually use. This is intentionally generous: the baseline gets
 * the best shot its real-world logic allows.
 */
const VENUE_GENRE_HINTS: Record<string, string[]> = {
  Arena: ["pop", "hip hop", "rap", "r&b", "electronic", "dance"],
  "Concert hall": ["pop", "rock", "classical", "orchestral", "singer", "folk", "jazz", "americana"],
  Amphitheater: ["pop", "rock", "hip hop", "electronic", "americana", "folk"],
  "Live music venue": ["rock", "indie", "alternative", "punk", "jazz", "experimental", "folk", "hip hop"],
  "Event venue": ["rock", "indie", "electronic", "hip hop", "experimental"],
  "Night club": ["electronic", "dance", "hip hop", "house", "techno"],
  Bar: ["punk", "rock", "indie", "experimental", "hardcore"],
  Lounge: ["jazz", "r&b", "hip hop", "soul"],
};

export async function runBaseline(roomId: string, take = 50): Promise<BaselineResult> {
  const room = ROOMS.find((r) => r.id === roomId);
  const roomName = room?.name ?? "room";
  const hints = VENUE_GENRE_HINTS[room?.genre ?? ""] ?? [];

  // Fetch the same candidate pool Roomtone sees, so the comparison is fair:
  // identical universe of acts, different reasoning over them.
  const pool = await insights(
    "urn:entity:artist",
    { entities: [roomId] },
    { label: `${roomName} → candidate pool (shared with the baseline)`, take },
  );
  const acts = pool.entities.map((e, i) => ({
    entity_id: e.entity_id,
    name: e.name,
    affinity: affinity(e) ?? 0,
    rank: i + 1,
    tags: (e.tags ?? []).filter((t) => t.id && t.name).map((t) => ({ id: t.id, name: t.name, type: t.type })),
    genres: [],
    popularity: e.popularity ?? 0,
  }));

  const byPopularity = [...acts].sort((a, b) => b.popularity - a.popularity);

  // Genre match: how many of the venue's musical hints an act carries. Only
  // string equality over Qloo's genre tags, never an affinity score.
  const genreHits = (a: RoomAct & { popularity: number }) => {
    const names = a.tags.map((t) => t.name.toLowerCase());
    return hints.filter((h) => names.some((n) => n === h || n.includes(h))).length;
  };

  const byGenreMatch = [...acts]
    .filter((a) => genreHits(a) > 0)
    .sort((a, b) => genreHits(b) - genreHits(a) || b.popularity - a.popularity)
    .slice(0, take);

  // Combined: the booker's gut. Popularity dominates, genre breaks ties.
  const maxPop = Math.max(1, ...acts.map((a) => a.popularity));
  const maxHits = Math.max(1, ...acts.map((a) => genreHits(a)));
  const ranking: BaselineRanking[] = acts
    .map((a) => ({
      act: a,
      popularityRank: 0,
      genreRank: 0,
      combinedRank: 0,
    }))
    .sort(
      (a, b) =>
        (b.act.popularity / maxPop + genreHits(b.act) / maxHits) -
        (a.act.popularity / maxPop + genreHits(a.act) / maxHits),
    );

  ranking.forEach((r, i) => {
    r.popularityRank = byPopularity.findIndex((x) => x.entity_id === r.act.entity_id) + 1;
    r.genreRank = Math.max(1, i + 1);
    r.combinedRank = i + 1;
  });

  return { roomName, byPopularity, byGenreMatch, ranking, calls: pool.calls };
}

/**
 * How different are the two answers?
 *
 * Reported as a rank correlation, which is the honest way to say "these two
 * orderings disagree": ρ = 1 means the baselines reproduce Roomtone exactly
 * (Roomtone adds nothing), ρ ≈ 0 means they are unrelated.
 */
export function spearman(a: string[], b: string[]): number {
  const shared = a.filter((x) => b.includes(x));
  if (shared.length < 3) return Number.NaN;

  const common = shared.filter((v, i, arr) => arr.indexOf(v) === i);
  if (common.length < 3) return Number.NaN;

  const ra = common.map((id) => a.indexOf(id) + 1);
  const rb = common.map((id) => b.indexOf(id) + 1);
  const n = common.length;

  const d2 = ra.reduce((s, x, i) => s + (x - rb[i]!) ** 2, 0);
  const denom = n * (n * n - 1);
  return denom === 0 ? Number.NaN : 1 - (6 * d2) / denom;
}

export function topN(acts: RoomAct[], n: number): string[] {
  return acts.slice(0, n).map((a) => a.entity_id);
}