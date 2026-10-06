import Link from "next/link";
import { ROOMS, FEATURED_ROOMS } from "@/lib/roomtone/catalog";
import { getFit, getActProfile, resolveAct } from "@/lib/roomtone/engine";
import { Evidence } from "@/components/Evidence";
import { ActPicker } from "@/components/ActPicker";
import type { QlooCall } from "@/lib/qloo/types";

export const dynamic = "force-dynamic";

/** Rooms picked to make the contrast unmissable, in one place if not another. */
const SPOTLIGHT = [
  { a: "The Stone", b: "Radio City Music Hall", why: "Jazz lineage vs arena rap. Two stops on the same subway." },
  { a: "Pier 36 NYC", b: "The Stone", why: "Hardcore rap vs experimental jazz. The clearest contrast in New York." },
  { a: "Beacon Theatre", b: "Pier 36 NYC", why: "Roots and jazz guitar vs hardcore rap." },
  { a: "Sony Hall", b: "Barclays Center", why: "Orchestral repertoire vs arena hip-hop." },
  { a: "Music Hall of Williamsburg", b: "Webster Hall", why: "Indie post-punk vs experimental rap-adjacent." },
];

function byName(n: string) {
  return ROOMS.find((r) => r.name === n);
}

export default async function TwoRoomsPage({ searchParams }: { searchParams: Promise<{ act?: string }> }) {
  const sp = await searchParams;
  const calls: QlooCall[] = [];
  const actId = sp.act ?? null;

  let act: { id: string; name: string } | null = null;
  if (actId) {
    try {
      const p = await getActProfile(actId);
      calls.push(...p.calls);
      act = { id: p.entity_id, name: p.name };
    } catch {
      /* fall through to the picker */
    }
  }

  // Default act when none supplied, so the page is never an empty shell.
  if (!act) {
    const fallback = await resolveAct("Yves Tumor");
    if (fallback.id && fallback.match === "strong") act = { id: fallback.id, name: fallback.name };
  }

  const rooms = FEATURED_ROOMS.length >= 4 ? FEATURED_ROOMS : ROOMS.slice(0, 5);

  let fits: Awaited<ReturnType<typeof getFit>>[] = [];
  if (act) {
    const out = await Promise.all(
      rooms.map(async (r) => {
        try {
          const f = await getFit(r.id, act!.id);
          calls.push(...f.calls);
          return f;
        } catch {
          return null;
        }
      }),
    );
    fits = out.filter((x): x is Awaited<ReturnType<typeof getFit>> => x !== null);
  }

  const maxPct = Math.max(1, ...fits.map((f) => Math.round((f.percentile ?? 0) * 100)));

  return (
    <>
      <h1 style={{ fontSize: 34 }}>Two rooms, same act</h1>
      <p className="lede" style={{ marginBottom: 26 }}>
        An act&apos;s quality is fixed. Whether it belongs in a particular room is not. This is the fastest way to
        see that — and it is the question a promoter is actually deciding when a guarantee is on the table.
      </p>

      <div className="card" style={{ marginBottom: 26 }}>
        <ActPicker initial={act ? { id: act.id, name: act.name } : undefined} />
        <p className="tiny faint" style={{ marginTop: 10, marginBottom: 0 }}>
          Currently reading <strong style={{ color: "var(--ink)" }}>{act?.name ?? "—"}</strong> across{" "}
          {rooms.length} measured rooms.
        </p>
      </div>

      {act && fits.length > 0 ? (
        <>
          <section className="card" style={{ marginBottom: 28 }}>
            <h2 style={{ marginBottom: 4 }}>{act.name}, room by room</h2>
            <p className="dim" style={{ fontSize: 14 }}>
              Percentile inside each room&apos;s own top-acts distribution.
            </p>

            <div className="stack" style={{ marginTop: 18, gap: 12 }}>
              {fits
                .slice()
                .sort((a, b) => (b.percentile ?? -1) - (a.percentile ?? -1))
                .map((f) => {
                  const pct = Math.round((f.percentile ?? 0) * 100);
                  const color =
                    f.band === "core" ? "var(--good)" : f.band === "edge" ? "var(--warn)" : f.band === "unmeasured" ? "var(--ink-faint)" : "var(--bad)";
                  return (
                    <div key={f.roomId}>
                      <div className="row" style={{ justifyContent: "space-between", marginBottom: 5 }}>
                        <span style={{ fontSize: 14.5 }}>
                          {f.roomName}
                          {f.rankInRoom ? (
                            <span className="tiny faint" style={{ marginLeft: 8 }}>
                              #{f.rankInRoom} of the room&apos;s top acts
                            </span>
                          ) : null}
                        </span>
                        <span className="mono tiny" style={{ color }}>
                          {f.percentile === null ? "not measured" : `${pct}th pct`}
                        </span>
                      </div>
                      <div className="meter">
                        <div
                          className="meter-fill"
                          /* A zero percentile is a real measurement, not a missing one,
                             so it gets a visible sliver rather than an empty track. */
                          style={{ width: `${Math.max(0.6, (pct / maxPct) * 100)}%`, background: color }}
                        />
                      </div>
                    </div>
                  );
                })}
            </div>

            <hr className="rule" style={{ margin: "24px 0 18px" }} />

            <p style={{ fontSize: 16.5, lineHeight: 1.55, margin: 0, maxWidth: "70ch" }}>
              {summarise(act.name, fits)}
            </p>
          </section>

          <section>
            <h2>Try a deliberately brutal pairing</h2>
            <div className="grid grid-2">
              {SPOTLIGHT.map((s) => {
                const ra = byName(s.a);
                const rb = byName(s.b);
                if (!ra || !rb) return null;
                return (
                  <Link
                    key={`${s.a}-${s.b}`}
                    href={`/two-rooms?act=${act.id}`}
                    className="card card-sunken"
                    style={{ display: "block" }}
                  >
                    <h3 style={{ marginBottom: 6 }}>
                      {s.a} <span className="faint">vs</span> {s.b}
                    </h3>
                    <p className="dim" style={{ fontSize: 13.5, marginBottom: 0 }}>
                      {s.why}
                    </p>
                  </Link>
                );
              })}
            </div>
          </section>
        </>
      ) : (
        <div className="notice">
          Pick an act to run the comparison. Roomtone will measure it against every room in the catalog that Qloo
          can read.
        </div>
      )}

      <div style={{ marginTop: 30 }}>
        <Evidence calls={calls} />
      </div>
    </>
  );
}

function summarise(actName: string, fits: { roomName: string; percentile: number | null; band: string; rankInRoom: number | null }[]): string {
  const core = fits.filter((f) => f.band === "core");
  const edge = fits.filter((f) => f.band === "edge");
  const outside = fits.filter((f) => f.band === "outside");

  if (core.length === 0 && edge.length === 0) {
    const rooms = fits.map((f) => f.roomName).join(", ");
    return `${actName} sits below the top acts in every room measured here (${rooms}). That is not a verdict on the act — it is a verdict on the rooms. It tells you this act needs a different stage, or a different city.`;
  }

  const parts: string[] = [];
  if (core.length) {
    parts.push(
      `${actName} is core to ${core.map((f) => `${f.roomName} (${f.rankInRoom ? `#${f.rankInRoom}` : "top 10"})`).join(" and ")}`,
    );
  }
  if (edge.length) parts.push(`an edge fit at ${edge.map((f) => f.roomName).join(" and ")}`);
  if (outside.length) parts.push(`outside the top acts at ${outside.map((f) => f.roomName).join(", ")}`);

  const lead = parts.slice(0, -1).join(", ");
  const tail = parts[parts.length - 1]!;
  const sentence = `${lead} and ${tail}.`;

  const spread = core.length && outside.length
    ? ` The gap between ${core[0]!.roomName} and ${outside[0]!.roomName} is the whole business case for reading a room before booking into it.`
    : "";

  return sentence + spread;
}