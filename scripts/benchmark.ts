/**
 * External benchmark: do the acts Roomtone says belong in a room match the acts
 * documentary evidence says actually played there?
 *
 * Ground truth is Wikipedia tour date tables — 943 documented shows across 161
 * venues from 57 major tours, independent of Qloo. Every venue was resolved to a
 * Qloo entity and then verified against its own geocode; venues that could not be
 * verified were dropped rather than matched on name alone.
 *
 * The metric is AUC: given a venue, the probability that Roomtone scores an act
 * that really played there above a plausible act that didn't. The same number is
 * computed for the incumbent method — ranking by Qloo's popularity percentile —
 * so the comparison is like-for-like on identical candidates.
 *
 *   tsx scripts/benchmark.ts          # computes and writes benchmark.json
 */
import { writeFileSync } from "node:fs";
import { qloo } from "../src/lib/qloo/client";
import type { QlooEntity } from "../src/lib/qloo/types";

interface GroundTruth {
  qloo_name: string;
  resolved_city: string | null;
  entity_id: string;
  artists: string[];
  /** Qloo's own venue type. The mechanism under test is that room reads work for
   *  venues whose programming is defined by the room and fail for multi-purpose
   *  arena/stadium entities, so this has to be carried through. */
  genre: string | null;
}

interface VenueResult {
  venue: string;
  city: string | null;
  genre: string | null;
  entityId: string;
  measured: number;
  documented: number;
  acts: { artist: string; name: string; id: string; affinity: number; popularity: number; observed: boolean }[];
  aucRoomtone: number;
  aucPopularity: number;
  inPool: number;
  localTop: string[];
  /** Lowest affinity in the venue's own top-50. Robust venue reads put
   *  documented acts above this floor. */
  poolMin: number;
  nPos: number;
  nNeg: number;
}

function normalise(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "")
    .trim();
}

/** AUC via the rank-sum (Mann–Whitney U) formula. No ties assumed to matter. */
function auc(positives: number[], negatives: number[]): number {
  if (!positives.length || !negatives.length) return Number.NaN;
  let wins = 0;
  let ties = 0;
  for (const p of positives) {
    for (const n of negatives) {
      if (p > n) wins++;
      else if (p === n) ties++;
    }
  }
  const total = positives.length * negatives.length;
  return (wins + 0.5 * ties) / total;
}

async function resolveArtist(name: string): Promise<QlooEntity | null> {
  try {
    const { data } = await qloo<{ results?: QlooEntity[] }>("/search", { query: name, types: "urn:entity:artist", limit: 3 });
    const hits = data.results ?? [];
    if (!hits.length) return null;
    const top = hits[0]!;
    // Qloo can map a name to the wrong artist. Only accept a close match.
    const a = normalise(name);
    const b = normalise(top.name);
    const close = b === a || b.startsWith(a) || a.startsWith(b) || b.includes(a) || a.includes(b);
    return close ? top : null;
  } catch {
    return null;
  }
}

async function run() {
  const truth: GroundTruth[] = JSON.parse(
    (await import("node:fs")).readFileSync("probe/benchmark_venues.json", "utf8"),
  );

  const results: VenueResult[] = [];

  for (const t of truth) {
    // 1. Candidate pool for this venue: the acts Qloo can rank against it.
    //    `poolMin` matters: if every documented act lands below the pool's floor,
    //    the read has missed the room rather than merely mis-ordered it.
    let pool: QlooEntity[] = [];
    let poolMin = 0;
    try {
      const { data } = await qloo<{ results?: { entities?: QlooEntity[] } }>("/v2/insights", {
        "filter.type": "urn:entity:artist",
        "signal.interests.entities": t.entity_id,
        take: 50,
      });
      pool = data.results?.entities ?? [];
    } catch {
      continue;
    }
    if (!pool.length) continue;
    poolMin = Math.min(...pool.map((e) => e.query?.affinity ?? 0));

    const poolById = new Map(pool.map((e) => [e.entity_id, e]));

    // 2. Resolve each documented artist. Accepts only close matches.
    const acts: VenueResult["acts"] = [];
    for (const artist of t.artists) {
      const e = await resolveArtist(artist);
      if (!e) continue;
      const observed = true;
      // Affinity for this act against this venue: ask for it explicitly when it
      // is not already in the pool.
      let entity: QlooEntity | undefined = poolById.get(e.entity_id);
      if (!entity) {
        try {
          const { data } = await qloo<{ results?: { entities?: QlooEntity[] } }>("/v2/insights", {
            "filter.type": "urn:entity:artist",
            "signal.interests.entities": t.entity_id,
            "filter.results.entities": e.entity_id,
            take: 1,
          });
          entity = data.results?.entities?.[0];
        } catch {
          continue;
        }
      }
      if (!entity || typeof entity.query?.affinity !== "number") continue;
      acts.push({
        artist,
        name: entity.name,
        id: entity.entity_id,
        affinity: entity.query.affinity,
        popularity: entity.popularity ?? 0,
        observed,
      });
    }

    // 3. Negatives: pool acts with no documented show at this venue.
    const observedIds = new Set(acts.map((a) => a.id));
    for (const e of pool) {
      if (observedIds.has(e.entity_id)) continue;
      if (typeof e.query?.affinity !== "number") continue;
      acts.push({
        artist: e.name,
        name: e.name,
        id: e.entity_id,
        affinity: e.query.affinity,
        popularity: e.popularity ?? 0,
        observed: false,
      });
    }

    const pos = acts.filter((a) => a.observed);
    const neg = acts.filter((a) => !a.observed);
    if (pos.length < 2 || neg.length < 3) continue;

    const aucRoomtone = auc(pos.map((a) => a.affinity), neg.map((a) => a.affinity));
    const aucPopularity = auc(pos.map((a) => a.popularity), neg.map((a) => a.popularity));

    results.push({
      venue: t.qloo_name,
      city: t.resolved_city,
      genre: t.genre ?? null,
      entityId: t.entity_id,
      measured: pos.length,
      documented: t.artists.length,
      acts: acts.filter((a) => a.observed),
      aucRoomtone,
      aucPopularity,
      poolMin,
      nPos: pos.length,
      nNeg: neg.length,
      /** How many of the documented acts appear in the venue's top-50 at all. */
      inPool: acts.filter((a) => a.observed && pool.some((p) => p.entity_id === a.id)).length,
      /** Domestic-language acts the venue's neighbourhood actually likes. This is
       *  the mechanism the benchmark exposed: Qloo place affinity describes the
       *  local audience, not the touring draw. */
      localTop: pool.slice(0, 6).map((e) => e.name),
    });

    console.log(
      `${t.qloo_name.slice(0, 22).padEnd(22)} ${String(t.genre ?? "?").slice(0, 15).padEnd(15)} ` +
        `doc=${t.artists.length} measured=${pos.length} auc=${aucRoomtone.toFixed(3)} ` +
        `pop=${aucPopularity.toFixed(3)} ${aucRoomtone > aucPopularity ? "✓" : "✗"}`,
    );
  }

  const n = results.length;
  const mean = (k: (r: VenueResult) => number) =>
    n ? results.reduce((s, r) => s + k(r), 0) / n : Number.NaN;
  const wins = results.filter((r) => r.aucRoomtone > r.aucPopularity).length;

  const summary = {
    venues: n,
    documentedShows: results.reduce((s, r) => s + r.documented, 0),
    measuredActs: results.reduce((s, r) => s + r.measured, 0),
    meanAucRoomtone: mean((r) => r.aucRoomtone),
    meanAucPopularity: mean((r) => r.aucPopularity),
    roomtoneWins: wins,
    totalDocs: truth.length,
    generatedAt: new Date().toISOString(),
  };

  console.log("\n=== SUMMARY ===");
  console.log(JSON.stringify(summary, null, 2));
  console.log(`\nRoomtone beat popularity on ${wins}/${n} venues`);
  console.log(`mean AUC: Roomtone ${summary.meanAucRoomtone.toFixed(3)} vs popularity ${summary.meanAucPopularity.toFixed(3)}`);

  writeFileSync("benchmark.json", JSON.stringify({ summary, results }, null, 2));
  console.log("\nwrote benchmark.json");
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});