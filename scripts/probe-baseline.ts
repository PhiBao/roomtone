import { ROOMS } from "../src/lib/roomtone/catalog";
import { getRoomProfile } from "../src/lib/roomtone/engine";
import { runBaseline, spearman, topN } from "../src/lib/roomtone/baseline";
import { computeLift } from "../src/lib/roomtone/lift";

async function main() {
  const names = process.argv.slice(2).length ? process.argv.slice(2) : ["The Stone", "Radio City Music Hall", "Webster Hall"];
  for (const n of names) {
    const r = ROOMS.find(x => x.name === n);
    if (!r) { console.log("??", n); continue; }
    const b = await runBaseline(r.id, 50);
    const rt = await getRoomProfile(r.id, 50);
    const rho = spearman(topN(rt.acts, 50), b.ranking.map(x => x.act.entity_id));
    const lift = await computeLift(r.id);
    console.log(`\n=== ${n} ===`);
    console.log(`  Roomtone top5 : ${rt.acts.slice(0,5).map(a=>a.name).join(", ")}`);
    console.log(`  Popularity top: ${b.byPopularity.slice(0,5).map(a=>a.name).join(", ")}`);
    console.log(`  Spearman rho (Roomtone vs incumbent) = ${isNaN(rho) ? "n/a" : rho.toFixed(3)}`);
    console.log(`  popularity-vs-affinity rho in this room = ${isNaN(lift.popularityCorrelation) ? "n/a" : lift.popularityCorrelation.toFixed(3)}`);
    console.log(`  top lift : ${lift.acts.slice(0,4).map(a=>`${a.name}(${a.lift>0?"+":""}${a.lift.toFixed(4)})`).join(", ")}`);
    console.log(`  worst lift: ${lift.acts.slice(-3).map(a=>`${a.name}(${a.lift.toFixed(4)})`).join(", ")}`);
  }
}
main().catch(e => { console.error(e); process.exit(1); });
