/** Diagnostic: what does /v2/analysis/compare actually return for two venues? */
import { compare, insights } from "../src/lib/qloo/client";
import { ROOMS } from "../src/lib/roomtone/catalog";

const MEANINGFUL = (t: string) =>
  !/urn:tag:(genre:place|category:place)/.test(t) &&
  /^urn:tag:(audience|style|theme|mood|subgenre):/.test(t) === true;

async function main() {
  const name = process.argv[2] ?? "The Stone";
  const room = ROOMS.find((r) => r.name === name);
  if (!room) throw new Error(`no room ${name}`);

  const near = await insights("urn:entity:place", { entities: [room.id] }, { label: "near", take: 8 });
  for (const c of near.entities.slice(1, 5)) {
    const cmp = await compare([room.id], [c.entity_id], "urn:tag");
    const meaningful = cmp.shared.filter((t) => MEANINGFUL(t.tag_id));
    console.log(`\n${c.name} :: shared_total=${cmp.shared.length} meaningful=${meaningful.length}`);
    console.log("  MEANINGFUL:", meaningful.slice(0, 10).map((t) => `${t.name}(${t.score.toFixed(2)})`).join(", ") || "(none)");
    console.log("  RAW TOP   :", cmp.shared.slice(0, 8).map((t) => t.name).join(", "));
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});