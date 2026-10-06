/**
 * Warms the Qloo response cache for every curated room.
 *
 * The demo must never depend on live latency or a rate limit. Running this
 * ahead of a demo means every room profile, taste profile and fit lookup is
 * served from cache, and the Evidence panel honestly reports `cache: hit`.
 *
 *   pnpm warm              # all rooms
 *   pnpm warm -- The Stone # rooms matching a substring
 */
import { ROOMS } from "../src/lib/roomtone/catalog";
import { getRoomProfile, getActProfile, resolveAct, getFit } from "../src/lib/roomtone/engine";
import { flushCache, cacheStats } from "../src/lib/qloo/client";

/** Acts we want cover for out of the box — recognisable names, wide genre spread. */
const SEED_ACTS = [
  "Bad Bunny", "Kamasi Washington", "Fred Again", "Khruangbin", "Aphex Twin",
  "Beyonce", "Hiatus Kaiyote", "Yves Tumor", "Bill Frisell",
  "Tyler The Creator", "Rosalia", "Bjork", "Floating Points", "Sade",
  "Nate Barbrack", "NxWorries", "Little Simz", "Four Tet",
];

async function pool<T>(items: T[], limit: number, fn: (item: T) => Promise<void>): Promise<void> {
  let i = 0;
  const workers = Array.from({ length: limit }, async () => {
    while (i < items.length) {
      const item = items[i++]!;
      try {
        await fn(item);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.warn(`  ! ${JSON.stringify(item)}: ${msg.slice(0, 120)}`);
      }
    }
  });
  await Promise.all(workers);
}

async function main() {
  if (!process.env.QLOO_API_KEY) {
    console.error("QLOO_API_KEY is not set. Export the hackathon key before warming.");
    process.exit(1);
  }
  const filter = process.argv[2];
  const rooms = filter ? ROOMS.filter((r) => r.name.toLowerCase().includes(filter.toLowerCase())) : ROOMS;

  console.log(`Warming ${rooms.length} room profile(s)…\n`);

  let unmeasured = 0;
  await pool(rooms, 3, async (room) => {
    const p = await getRoomProfile(room.id, 50);
    if (p.unmeasured) {
      unmeasured++;
      console.log(`  unmeasured  ${room.name} (${room.city}) — Qloo has no taste signal for this room`);
      return;
    }
    const top = p.acts.slice(0, 5).map((a) => a.name).join(", ");
    console.log(
      `  ${room.name} (${room.city}) — n=${p.acts.length} ` +
        `band=[${p.baseline.min.toFixed(3)}..${p.baseline.max.toFixed(3)}] :: ${top}`,
    );
  });

  console.log(`\nWarming ${SEED_ACTS.length} act profile(s)…\n`);
  const actIds: { id: string; name: string }[] = [];
  await pool(SEED_ACTS, 2, async (name) => {
    const r = await resolveAct(name);
    if (!r.id) {
      console.log(`  unresolved  ${name}`);
      return;
    }
    // Never warm a mis-resolved entity: Qloo will map "Nate Barbrack" to
    // "Nate Dogg", and a poisoned act would quietly corrupt every fit.
    if (r.match === "weak") {
      console.warn(`  WEAK MATCH  "${name}" -> ${r.name} — skipped, resolve manually`);
      return;
    }
    actIds.push({ id: r.id, name: r.name });
    await getActProfile(r.id);
    console.log(`  ${r.name}`);
  });

  // Pre-fit every seeded act against every featured room: this is the exact
  // query the "Two Rooms" demo makes, so it must never be a cold path.
  const featured = ROOMS.filter((r) => r.featured);
  console.log(`\nPre-computing fits: ${actIds.length} acts × ${featured.length} featured rooms…\n`);
  let fits = 0;
  await pool(actIds, 2, async (act) => {
    for (const room of featured) {
      const f = await getFit(room.id, act.id);
      fits++;
      const pct = f.percentile === null ? "  n/a" : `${Math.round(f.percentile * 100)}%`;
      console.log(`  ${act.name.padEnd(20).slice(0, 20)} @ ${room.name.padEnd(26).slice(0, 26)} ${pct.padStart(5)}  ${f.band}`);
    }
  });

  flushCache();
  console.log(`\nDone. ${fits} fits computed · ${unmeasured} rooms unmeasured · cache entries: ${cacheStats().entries}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});