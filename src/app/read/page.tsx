import Link from "next/link";
import { FEATURED_ROOMS, ROOMS } from "@/lib/roomtone/catalog";
import { getFit, getActProfile, getSponsorFit } from "@/lib/roomtone/engine";
import { Evidence } from "@/components/Evidence";
import { ActPicker } from "@/components/ActPicker";
import type { QlooCall } from "@/lib/qloo/types";

export const dynamic = "force-dynamic";

function bandPill(band: string) {
  const cls =
    band === "core" ? "pill pill-core" : band === "edge" ? "pill pill-edge" : band === "unmeasured" ? "pill pill-unmeasured" : "pill pill-outside";
  const label = band === "core" ? "Core" : band === "edge" ? "Edge" : band === "unmeasured" ? "Not measured" : "Outside";
  return { cls, label };
}

export default async function ReadPage({
  searchParams,
}: {
  searchParams: Promise<{ room?: string; act?: string }>;
}) {
  const sp = await searchParams;
  const room = ROOMS.find((r) => r.id === sp.room) ?? FEATURED_ROOMS[0]!;
  const actId = sp.act ?? null;

  const calls: QlooCall[] = [];
  let act: { id: string; name: string; genres: string[]; similar: { name: string; rank: number; affinity: number; entity_id: string }[] } | null = null;
  let fits: Awaited<ReturnType<typeof getFit>>[] = [];
  let sponsor: Awaited<ReturnType<typeof getSponsorFit>> | null = null;
  let error: string | null = null;

  if (actId) {
    try {
      const profile = await getActProfile(actId);
      calls.push(...profile.calls);
      act = { id: profile.entity_id, name: profile.name, genres: profile.genres, similar: profile.similar.slice(0, 8) };

      const sp = await getSponsorFit(actId, profile.name).catch(() => null);
      if (sp) {
        sponsor = sp;
        calls.push(...sp.calls);
      }

      // The room asked about, plus the other featured rooms — a booking decision
      // is never made against one room in isolation.
      const targets = [room, ...FEATURED_ROOMS.filter((r) => r.id !== room.id)];
      const results = await Promise.all(
        targets.map(async (r) => {
          try {
            const f = await getFit(r.id, actId);
            calls.push(...f.calls);
            return f;
          } catch (err) {
            error = err instanceof Error ? err.message : String(err);
            return null;
          }
        }),
      );
      fits = results.filter((x): x is Awaited<ReturnType<typeof getFit>> => x !== null);
    } catch (err) {
      error = err instanceof Error ? err.message : String(err);
    }
  }

  const primary = fits.find((f) => f.roomId === room.id) ?? null;

  return (
    <>
      <h1 style={{ fontSize: 34 }}>Read a room</h1>
      <p className="lede" style={{ marginBottom: 14 }}>
        Pick the room. Roomtone returns the audience Qloo assigns to it — its local crowd, expressed as acts and
        taste — and places any act you name inside that audience.
      </p>
      <div className="notice" style={{ marginBottom: 26 }}>
        <strong>Read this first.</strong> Qloo&apos;s room read describes a venue&apos;s <em>local</em> audience — the
        people who are already there. It does not predict draw, and the{" "}
        <a href="/benchmark" style={{ color: "var(--ink)" }}>benchmark</a> that tested that found the gap plainly.
        Use it to program a room for its own audience, not to predict a headline&apos;s gross.
      </div>

      <div className="card" style={{ marginBottom: 26 }}>
        <div className="grid grid-2" style={{ gap: 20 }}>
          <div>
            <form action="/read">
              {actId ? <input type="hidden" name="act" value={actId} /> : null}
              <label className="field">
                <span className="field-label">Room</span>
                <select className="input" name="room" defaultValue={room.id}>
                  {ROOMS.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.name} — {[r.neighborhood, r.city].filter(Boolean).join(", ")}
                    </option>
                  ))}
                </select>
              </label>
              <button className="btn btn-sm" type="submit">
                Use this room
              </button>
            </form>
          </div>
          <div>
            <ActPicker />
          </div>
        </div>
      </div>

      {error ? (
        <div className="notice notice-danger">
          Qloo did not answer cleanly: <span className="mono">{error}</span>. The reading below may be incomplete —
          retry rather than quoting it.
        </div>
      ) : null}

      {!actId ? (
        <>
          <hr className="rule" />
          <h2>Start with a room</h2>
          <p className="dim" style={{ maxWidth: "64ch" }}>
            Each of these has a measured audience in Qloo&apos;s graph. They are chosen because their crowds
            barely overlap.
          </p>
          <div className="grid grid-3">
            {FEATURED_ROOMS.map((r) => (
              <Link key={r.id} href={`/read?room=${r.id}`} className="card" style={{ display: "block" }}>
                <h3 style={{ marginBottom: 4 }}>{r.name}</h3>
                <div className="tiny faint">
                  {r.neighborhood} · {r.genre}
                </div>
              </Link>
            ))}
          </div>
        </>
      ) : null}

      {act && primary ? (
        <>
          <hr className="rule" />

          <section className="card" style={{ marginBottom: 24 }}>
            <div className="row" style={{ justifyContent: "space-between", marginBottom: 10 }}>
              <div>
                <div className="tiny faint">Booking read</div>
                <h2 style={{ margin: "4px 0 0" }}>
                  {act.name} in {room.name}&apos;s audience
                </h2>
              </div>
              <span className={bandPill(primary.band).cls}>{bandPill(primary.band).label}</span>
            </div>

            <p style={{ fontSize: 17, lineHeight: 1.55, maxWidth: "66ch" }}>{primary.verdict}</p>

            {primary.percentile !== null ? (
              <div style={{ marginTop: 18 }}>
                <div className="row" style={{ justifyContent: "space-between", marginBottom: 6 }}>
                  <span className="tiny faint">
                    position within {room.name}&apos;s own top-50 acts
                  </span>
                  <span className="mono tiny">{Math.round(primary.percentile * 100)}th percentile</span>
                </div>
                <div className="meter">
                  <div
                    className="meter-fill"
                    style={{
                      width: `${Math.max(2, primary.percentile * 100)}%`,
                      background:
                        primary.band === "core" ? "var(--good)" : primary.band === "edge" ? "var(--warn)" : "var(--bad)",
                    }}
                  />
                </div>
                <p className="tiny faint" style={{ marginTop: 8, marginBottom: 0 }}>
                  Raw Qloo affinity {primary.rawAffinity?.toFixed(4)}. Roomtone reports the percentile inside this
                  room&apos;s own distribution because raw affinities are tightly banded and mean little on their
                  own.
                </p>
              </div>
            ) : null}
          </section>

          <section style={{ marginBottom: 28 }}>
            <h2>The same act, every measured room</h2>
            <p className="dim" style={{ maxWidth: "68ch" }}>
              This is the whole product in one table. An act that is core in one room and outside five others is
              not a bad act — it is a mismatch, and it is the cheapest thing to fix before a guarantee goes out.
            </p>

            <div className="grid grid-2">
              {fits.map((f) => {
                const pct = f.percentile === null ? null : Math.round(f.percentile * 100);
                const bp = bandPill(f.band);
                return (
                  <div
                    className="card card-sunken"
                    key={f.roomId}
                    style={f.roomId === room.id ? { borderColor: "var(--accent)" } : undefined}
                  >
                    <div className="card-head">
                      <h3 style={{ margin: 0 }}>{f.roomName}</h3>
                      <span className={bp.cls}>{bp.label}</span>
                    </div>
                    <div className="meter" style={{ marginBottom: 10 }}>
                      <div
                        className="meter-fill"
                        style={{
                          width: `${Math.max(2, pct ?? 0)}%`,
                          background: f.band === "core" ? "var(--good)" : f.band === "edge" ? "var(--warn)" : "var(--bad)",
                        }}
                      />
                    </div>
                    <div className="tiny faint">
                      {pct === null
                        ? "no measurement"
                        : `${pct}th percentile${f.rankInRoom ? ` · #${f.rankInRoom} of the room's top acts` : " · below the top acts"}`}
                    </div>
                  </div>
                );
              })}
            </div>
          </section>

          {sponsor && sponsor.brands.length > 0 ? (
            <section style={{ marginBottom: 28 }}>
              <h2>Who actually reaches this audience</h2>
              <p className="dim" style={{ maxWidth: "68ch" }}>
                Sponsorship selection is done on vibes and follower counts. Qloo can do better: these are the
                brands whose audiences sit closest to {act.name}&apos;s, measured on the same graph.
              </p>
              {sponsor.confidence === "high" ? (
                <>
                  <div className="card">
                    <div className="row">
                      {sponsor.brands.slice(0, 12).map((b) => (
                        <span className="tagpill tagpill-audience" key={b.id} title={`affinity ${b.affinity.toFixed(4)}`}>
                          {b.name}
                        </span>
                      ))}
                    </div>
                    <p className="tiny faint" style={{ marginTop: 12, marginBottom: 0 }}>
                      Affinity spread {(sponsor.brands[0]!.affinity - sponsor.brands[sponsor.brands.length - 1]!.affinity).toFixed(3)} —
                      tight enough to be a shortlist.
                    </p>
                  </div>
                  <div className="notice" style={{ marginTop: 14 }}>
                    <strong>This is the pitch, and it is a real one.</strong> Roomtone is independent — it sells no
                    sponsorship, which is the only position from which it can say whether a brand reaches a room at
                    all. Audience overlap is not a value estimate and says nothing about deal terms.
                  </div>
                </>
              ) : (
                <div className="notice">
                  Qloo returns brands for {act.name}, but they span affinity{" "}
                  {(sponsor.brands[0]!.affinity - sponsor.brands[sponsor.brands.length - 1]!.affinity).toFixed(2)} — too
                  diffuse to be a shortlist. Showing it as one would be padding, so Roomtone doesn&apos;t.
                </div>
              )}
            </section>
          ) : null}

          {act.similar.length > 0 ? (
            <section style={{ marginBottom: 28 }}>
              <h2>Acts closest to {act.name}</h2>
              <p className="dim" style={{ maxWidth: "66ch" }}>
                Qloo&apos;s cross-domain read on this act&apos;s audience. Useful when a room is the wrong fit and
                the question becomes who is right for it.
              </p>
              <div className="card">
                <ul className="act-list">
                  {act.similar.map((s) => (
                    <li className="act-row" key={s.entity_id}>
                      <span className="act-rank">{s.rank}</span>
                      <span className="act-name">{s.name}</span>
                      <span className="act-aff">{s.affinity.toFixed(3)}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </section>
          ) : null}

          <div className="row" style={{ marginBottom: 30 }}>
            <Link href={`/brief?room=${room.id}&act=${act.id}`} className="btn btn-primary">
              Generate the Brief
            </Link>
            <Link href={`/two-rooms?act=${act.id}`} className="btn">
              Side by side across rooms →
            </Link>
          </div>
        </>
      ) : null}

      <Evidence calls={calls} />
    </>
  );
}