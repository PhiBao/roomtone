import Link from "next/link";
import { notFound } from "next/navigation";
import { ROOMS } from "@/lib/roomtone/catalog";
import { getRoomProfile, getScenePeers } from "@/lib/roomtone/engine";
import { readRoomSponsors } from "@/lib/roomtone/sponsors";
import { Evidence } from "@/components/Evidence";
import { ActList } from "@/components/RoomCard";
import type { QlooCall } from "@/lib/qloo/types";

export const dynamic = "force-dynamic";

export default async function RoomPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!ROOMS.some((r) => r.id === id)) notFound();

  let profile: Awaited<ReturnType<typeof getRoomProfile>> | null = null;
  let peers: Awaited<ReturnType<typeof getScenePeers>>["peers"] = [];
  let sponsor: Awaited<ReturnType<typeof readRoomSponsors>> | null = null;
  const calls: QlooCall[] = [];
  let failure: string | null = null;

  try {
    profile = await getRoomProfile(id, 50);
    calls.push(...profile.calls);
  } catch (err) {
    failure = err instanceof Error ? err.message : String(err);
  }

  // Scene peers are an enrichment, never a blocker for the page.
  if (profile && !profile.unmeasured) {
    try {
      const r = await getScenePeers(id, 6);
      peers = r.peers;
      calls.push(...r.calls);
    } catch {
      /* scene overlap is enrichment */
    }
  }

  // Sponsorship is the commercial payoff of the local-audience read, so it sits
  // in the room's main flow rather than on a separate page.
  if (profile && !profile.unmeasured) {
    try {
      sponsor = await readRoomSponsors(id, 8);
      calls.push(...sponsor.calls);
    } catch {
      /* a missing sponsor read is not worth failing the page over */
    }
  }

  const room = ROOMS.find((r) => r.id === id)!;

  return (
    <>
      <nav className="tiny faint" style={{ marginBottom: 14 }}>
        <Link href="/rooms">Rooms</Link> / {room.name}
      </nav>

      <div className="card-head" style={{ alignItems: "flex-start" }}>
        <div>
          <h1 style={{ fontSize: 36, marginBottom: 6 }}>{room.name}</h1>
          <div className="row">
            <span className="pill">{room.genre ?? "Venue"}</span>
            <span className="pill">{[room.neighborhood, room.city].filter(Boolean).join(" · ")}</span>
          </div>
        </div>
        <div className="row">
          <Link href={`/brief?room=${room.id}`} className="btn btn-sm">
            Brief
          </Link>
          <Link href={`/read?room=${room.id}`} className="btn btn-primary btn-sm">
            Read a booking
          </Link>
        </div>
      </div>

      {failure ? (
        <div className="notice notice-danger">
          Could not load this room right now: <span className="mono">{failure}</span>. Qloo may be rate limiting.
          Everything else on this page still works.
        </div>
      ) : null}

      {profile?.unmeasured ? (
        <div className="notice">
          <strong>Qloo has no taste signal for {room.name}.</strong> Some venues exist in the graph without
          audience coverage, and Roomtone would rather show you that than invent a profile. Try another room.
        </div>
      ) : null}

      {profile && !profile.unmeasured ? (
        <>
          <hr className="rule" />

          <section style={{ marginBottom: 34 }}>
            <div className="card-head">
              <h2 style={{ margin: 0 }}>Who is actually in this room</h2>
              <span className="tiny faint">
                top {profile.baseline.n} acts · affinity {profile.baseline.min.toFixed(3)}–
                {profile.baseline.max.toFixed(3)}
              </span>
            </div>
            <p className="dim" style={{ maxWidth: "66ch" }}>
              Qloo ranks the {profile.baseline.n} acts whose audiences sit closest to {room.name}&apos;s own
              local crowd. This is the room&apos;s audience, expressed as names rather than segments — the people
              who are already there, not the touring acts who fill it on the nights they come through.
            </p>
            <div className="notice" style={{ marginBottom: 14 }}>
              Two independent axes, deliberately never combined into one number. <strong>Taste fit</strong> is
              this list&apos;s ordering. <strong>Draw</strong> is the popularity column. An act can sit at either
              extreme, and a booking decision needs both — which is why Roomtone shows them separately and never
              merges them.
            </div>
            <div className="card">
              <ActList acts={profile.acts} limit={25} />
            </div>
          </section>

          <section style={{ marginBottom: 34 }}>
            <h2>The room&apos;s taste, distilled</h2>
            <p className="dim" style={{ maxWidth: "66ch" }}>
              Every act above carries dozens of taste tags. These are the ones held by enough of the room&apos;s
              crowd to describe it — weighted by how much affinity mass each tag carries, so a genre every act
              shares outranks a trait that appears once.
            </p>
            <div className="card">
              {profile.tasteTags.length === 0 ? (
                <p className="dim" style={{ margin: 0 }}>
                  No taste tags met the threshold for this room.
                </p>
              ) : (
                <div>
                  {profile.tasteTags.map((t) => (
                    <span
                      key={`${t.type}:${t.name}`}
                      className={`tagpill ${
                        t.type.includes("audience") ? "tagpill-audience" : t.type.includes("genre") ? "tagpill-genre" : ""
                      }`}
                      title={`weight ${t.weight.toFixed(3)} · ${t.type}`}
                    >
                      {t.name}
                    </span>
                  ))}
                </div>
              )}
            </div>
          </section>

          {peers.length > 0 ? (
            <section style={{ marginBottom: 34 }}>
              <h2>Rooms that share this crowd</h2>
              <p className="dim" style={{ maxWidth: "68ch" }}>
                Qloo ranks nearby venues by cultural proximity, then Roomtone fetches each one&apos;s own top{" "}
                {profile.baseline.n} acts and compares the two lists directly. The number is how many acts appear
                in both rooms&apos; audiences — and they are named, so you can check the claim.
              </p>
              <div className="grid grid-2">
                {peers.map((p) => (
                  <div className="card card-sunken" key={p.room.id}>
                    <div className="card-head">
                      <h3 style={{ margin: 0 }}>{p.room.name}</h3>
                      <span className="pill">
                        {p.sharedActs.length} of {profile.baseline.n} acts in common
                      </span>
                    </div>
                    <div className="tiny faint" style={{ marginBottom: 8 }}>
                      Jaccard overlap {(p.jaccard * 100).toFixed(0)}% over a union of {p.unionSize} acts
                    </div>
                    <div className="row">
                      {p.sharedActs.slice(0, 8).map((a) => (
                        <span className="tagpill" key={a.id}>
                          {a.name}
                        </span>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </section>
          ) : null}
        </>
      ) : null}

      {sponsor && sponsor.sponsors.length > 0 ? (
        <section style={{ marginBottom: 34 }}>
          <h2>Which brands this crowd already buys</h2>
          <p className="dim" style={{ maxWidth: "70ch" }}>
            Qloo&apos;s brand affinity is sharp from an act and diffuse from a venue, so this is composed: the
            brands whose audiences overlap the {" "}
            <em>local</em> acts whose audiences are closest to {room.name}&apos;s crowd — built from{" "}
            {sponsor.actsSampled} of them, weighted by how close each is to the room.
          </p>
          {sponsor.confidence === "high" ? (
            <div className="card">
              <div className="card-head">
                <h3 style={{ margin: 0 }}>
                  Sponsorable categories for {room.name}&apos;s crowd
                </h3>
                <span className="pill pill-core">reach-weighted</span>
              </div>
              <div className="row">
                {sponsor.sponsors.map((b) => (
                  <span
                    className="tagpill tagpill-audience"
                    key={`${b.id}-${b.name}`}
                    title={`reach ${b.reach.toFixed(3)} — via ${b.via.join(", ")}`}
                  >
                    {b.name}
                  </span>
                ))}
              </div>
              <p className="tiny faint" style={{ marginTop: 14, marginBottom: 0 }}>
                Reach is the affinity-weighted share of this room&apos;s audience overlapping each brand. Hover any
                brand for the local acts that connect it to the crowd.
              </p>
            </div>
          ) : (
            <div className="notice">
              {sponsor.note}
            </div>
          )}
          <div className="notice" style={{ marginTop: 14 }}>
            This is a read of <strong>who is already there</strong>, not of who a touring headline would bring on a
            given night. Live Nation Media &amp; Sponsorship booked most of its 2026 commitments before the year
            began; by its own account there is no independent measure of whether those brands reached the audience
            they were sold. Roomtone sells no sponsorship, which is the only position this read is credible from.
          </div>
        </section>
      ) : null}

      <Evidence calls={calls} />
    </>
  );
}