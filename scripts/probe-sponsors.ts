import { readRoomSponsors } from "../src/lib/roomtone/sponsors";
import { ROOMS } from "../src/lib/roomtone/catalog";

async function main() {
  for (const n of process.argv.slice(2).length ? process.argv.slice(2) : ["The Stone", "Pier 36 NYC", "KOKO"]) {
    const r = ROOMS.find(x => x.name === n);
    if (!r) continue;
    const s = await readRoomSponsors(r.id, 8);
    console.log(`\n=== ${r.name} (${r.city}) — sampled ${s.actsSampled} local acts, confidence=${s.confidence} ===`);
    for (const b of s.sponsors.slice(0, 10)) console.log(`  ${b.reach.toFixed(3)}  ${b.name.padEnd(26)} via ${b.via.slice(0,2).join(", ")}`);
  }
}
main().catch(e => { console.error(e); process.exit(1); });
