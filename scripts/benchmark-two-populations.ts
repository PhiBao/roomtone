/**
 * Two-population benchmark: does the room read predict the support bill, and
 * does it predict the headline?
 *
 * The first benchmark tested only headliners and found 0 of 149 in their
 * venue's Qloo top-50. But a support act is typically smaller and
 * genre-specific — closer to a room's local audience cluster. That is the
 * population this product actually claims to serve, and it was never tested.
 *
 * Both populations are measured on the SAME verified venues with the SAME
 * candidate pool, so the contrast is the finding: where the boundary sits.
 *
 * Metric is hit@K — the share of documented acts that Qloo already ranks inside
 * the venue's top K — against the incumbent popularity ranking on the same pool.
 *
 *   tsx scripts/benchmark-two-populations.ts
 */
import { writeFileSync, readFileSync } from "node:fs";
import { qloo } from "../src/lib/qloo/client";
import type { QlooEntity } from "../src/lib/qloo/types";

interface Show {
  headliner: string;
  tour: string;
  venue: string;
  city: string;
  openers: string[];
}

interface VerifiedVenue {
  qloo_name: string;
  resolved_city: string | null;
  entity_id: string;
  genre: string | null;
  artists: string[];
  /** The Wikipedia venue name this entity was resolved from. Qloo renames
   *  venues (SSE Hydro -> OVO Hydro, Air Canada Centre -> Scotiabank Arena), so
   *  matching against `qloo_name` silently dropped most shows. */
  query: string;
}

function normalise(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "")
    .trim();
}

function closeEnough(query: string, candidate: string): boolean {
  const a = normalise(query);
  const b = normalise(candidate);
  if (!a || !b) return false;
  return b === a || b.startsWith(a) || a.startsWith(b) || b.includes(a) || a.includes(b);
}

async function resolveArtist(name: string): Promise<QlooEntity | null> {
  try {
    const { data } = await qloo<{ results?: QlooEntity[] }>("/search", {
      query: name,
      types: "urn:entity:artist",
      limit: 3,
    });
    const top = data.results?.[0];
    return top && closeEnough(name, top.name) ? top : null;
  } catch {
    return null;
  }
}

const JUNK = /^\[\s*\d+\s*\]$|^\d+$|^—$|^-$|^n\/?a$/i;

interface Population {
  hits: { at10: number; at25: number; at50: number; total: number };
  popHits: { at10: number; at25: number; at50: number; total: number };
  examples: { act: string; rank: number | null; popularity: number }[];
}

function emptyPopulation(): Population {
  return {
    hits: { at10: 0, at25: 0, at50: 0, total: 0 },
    popHits: { at10: 0, at25: 0, at50: 0, total: 0 },
    examples: [],
  };
}

async function main() {
  const venues: VerifiedVenue[] = JSON.parse(
    readFileSync("probe/benchmark_venues.json", "utf8"),
  );
  const shows: Show[] = JSON.parse(readFileSync("probe/shows.json", "utf8"));

  const headliners = emptyPopulation();
  const openers = emptyPopulation();
  const perVenue: {
    venue: string;
    city: string | null;
    headlinerPlays: number;
    headlinerHit10: number;
    headlinerHit50: number;
    openerPlays: number;
    openerHit10: number;
    openerHit50: number;
    populationHit10: number;
    populationHit50: number;
  }[] = [];

  // Cache resolutions across venues — the same act recurs.
  const resolved = new Map<string, QlooEntity | { missing: true }>();

  for (const v of venues) {
    let pool: QlooEntity[] = [];
    try {
      const { data } = await qloo<{ results?: { entities?: QlooEntity[] } }>("/v2/insights", {
        "filter.type": "urn:entity:artist",
        "signal.interests.entities": v.entity_id,
        take: 50,
      });
      pool = data.results?.entities ?? [];
    } catch {
      continue;
    }
    if (!pool.length) continue;

    const audienceIds = new Set(pool.map((e) => e.entity_id));
    const populationPool = [...pool]
      .sort((a, b) => (b.popularity ?? 0) - (a.popularity ?? 0))
      .map((e) => e.entity_id);

    // Documented acts at this venue, split by role.
    // Match on the documented name, not Qloo's, and compare loosely so that
    // "The O 2 Arena" and "The O2 Arena" are the same room.
    const key = normalise(v.query);
    const atVenue = shows.filter((s) => {
      const sv = normalise(s.venue);
      return sv === key || sv === normalise(v.qloo_name) || sv.startsWith(key) || key.startsWith(sv);
    });
    const headlinerNames = [...new Set(atVenue.map((s) => s.headliner))];
    const openerNames = [
      ...new Set(atVenue.flatMap((s) => s.openers).filter((n) => n && !JUNK.test(n.trim()))),
    ];

    const measure = async (names: string[], target: Population) => {
      let plays = 0;
      let h10 = 0;
      let h50 = 0;
      for (const name of names) {
        let e = resolved.get(name);
        if (e === undefined) {
          const r = await resolveArtist(name);
          e = r ?? { missing: true };
          resolved.set(name, e);
        }
        if ("missing" in e) continue;
        const id = (e as QlooEntity).entity_id;
        if (!audienceIds.has(id)) {
          // Documented at this venue but absent from its audience — a real miss.
          plays++;
          target.hits.total++;
          target.popHits.total++;
          continue;
        }
        plays++;
        const rank = pool.findIndex((p) => p.entity_id === id) + 1;
        const popRank = populationPool.findIndex((p) => p === id) + 1;
        target.hits.total++;
        target.popHits.total++;
        if (rank <= 10) target.hits.at10++;
        if (rank <= 25) target.hits.at25++;
        if (rank <= 50) target.hits.at50++;
        if (popRank <= 10) target.popHits.at10++;
        if (popRank <= 25) target.popHits.at25++;
        if (popRank <= 50) target.popHits.at50++;
      }
      return { plays, h10, h50 };
    };

    const hi = await measure(headlinerNames, headliners);
    const op = await measure(openerNames, openers);

    perVenue.push({
      venue: v.qloo_name,
      city: v.resolved_city,
      headlinerPlays: hi.plays,
      headlinerHit10: hi.h10,
      headlinerHit50: hi.h50,
      openerPlays: op.plays,
      openerHit10: op.h10,
      openerHit50: op.h50,
      populationHit10: headliners.popHits.at10,
      populationHit50: headliners.popHits.at50,
    });

    console.log(
      `${v.qloo_name.slice(0, 24).padEnd(24)} ` +
        `headliners ${String(hi.plays).padStart(2)} plays / ${hi.h10} in top10 / ${hi.h50} in top50   ` +
        `openers ${String(op.plays).padStart(2)} plays / ${op.h10} in top10 / ${op.h50} in top50`,
    );
  }

  const pct = (n: number, d: number) => (d ? `${((n / d) * 100).toFixed(1)}%` : "n/a");

  const summary = {
    venues: perVenue.length,
    headliners: {
      plays: headliners.hits.total,
      hit10: pct(headliners.hits.at10, headliners.hits.total),
      hit25: pct(headliners.hits.at25, headliners.hits.total),
      hit50: pct(headliners.hits.at50, headliners.hits.total),
      popularityHit50: pct(headliners.popHits.at50, headliners.popHits.total),
    },
    openers: {
      plays: openers.hits.total,
      hit10: pct(openers.hits.at10, openers.hits.total),
      hit25: pct(openers.hits.at25, openers.hits.total),
      hit50: pct(openers.hits.at50, openers.hits.total),
      popularityHit50: pct(openers.popHits.at50, openers.popHits.total),
    },
    generatedAt: new Date().toISOString(),
  };

  console.log("\n=== SUMMARY ===");
  console.log(JSON.stringify(summary, null, 2));

  writeFileSync("benchmark-populations.json", JSON.stringify({ summary, perVenue }, null, 2));
  console.log("\nwrote benchmark-populations.json");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});