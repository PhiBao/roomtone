import Link from "next/link";
import { ROOMS } from "@/lib/roomtone/catalog";
import { getRoomProfile, getFit, getActProfile, getSponsorFit } from "@/lib/roomtone/engine";
import type { QlooCall } from "@/lib/qloo/types";

export const dynamic = "force-dynamic";

/**
 * The Brief.
 *
 * Everything else in Roomtone is a tool. This is the deliverable — a single
 * page a promoter can actually put in front of an artist manager, which is the
 * only version of this that changes what happens on a booking.
 */
export default async function BriefPage({ searchParams }: { searchParams: Promise<{ room?: string; act?: string }> }) {
  const sp = await searchParams;
  const room = ROOMS.find((r) => r.id === sp.room);
  const calls: QlooCall[] = [];

  if (!room) {
    return (
      <>
        <h1 style={{ fontSize: 34 }}>Brief</h1>
        <div className="notice">
          A Brief needs a room. Open a{" "}
          <Link href="/rooms" style={{ color: "var(--ink)" }}>
            room
          </Link>{" "}
          first, then pick an act to generate the document.
        </div>
      </>
    );
  }

  const profile = await getRoomProfile(room.id, 50).catch(() => null);
  if (profile) calls.push(...profile.calls);

  let act: Awaited<ReturnType<typeof getActProfile>> | null = null;
  let fit: Awaited<ReturnType<typeof getFit>> | null = null;
  let sponsor: Awaited<ReturnType<typeof getSponsorFit>> | null = null;

  if (sp.act) {
    act = await getActProfile(sp.act).catch(() => null);
    if (act) calls.push(...act.calls);
    fit = await getFit(room.id, sp.act).catch(() => null);
    if (fit) calls.push(...fit.calls);
    sponsor = await getSponsorFit(sp.act, act?.name).catch(() => null);
    if (sponsor) calls.push(...sponsor.calls);
  }

  const comparable = ROOMS.filter((r) => r.id !== room.id).slice(0, 5);
  const otherFits: Awaited<ReturnType<typeof getFit>>[] = [];
  if (sp.act) {
    for (const r of comparable) {
      const f = await getFit(r.id, sp.act).catch(() => null);
      if (f) otherFits.push(f);
    }
  }

  const stamp = new Date().toISOString().slice(0, 10);

  return (
    <article
      className="card"
      style={{ maxWidth: 860, margin: "0 auto", padding: "38px 40px" }}
    >
      <header style={{ borderBottom: "1px solid var(--line)", paddingBottom: 20, marginBottom: 24 }}>
        <div className="row" style={{ justifyContent: "space-between", marginBottom: 10 }}>
          <span className="tiny" style={{ color: "var(--accent)" }}>
            Roomtone · Booking Brief
          </span>
          <span className="tiny faint mono">{stamp}</span>
        </div>
        <h1 style={{ fontSize: 30, margin: "0 0 6px" }}>
          {act ? `${act.name} at ${room.name}` : room.name}
        </h1>
        <div className="tiny faint">
          {[room.neighborhood, room.city].filter(Boolean).join(", ")} · {room.genre} ·{" "}
          <span className="mono">{room.id}</span>
        </div>
      </header>

      {profile && !profile.unmeasured ? (
        <>
          <section style={{ marginBottom: 22 }}>
            <h3>The room</h3>
            <p className="dim" style={{ fontSize: 14.5 }}>
              {room.name}&apos;s crowd sits closest to{" "}
              <strong style={{ color: "var(--ink)" }}>{profile.acts.slice(0, 10).map((a) => a.name).join(", ")}</strong>{" "}
              and {profile.acts.length - 10} others in Qloo&apos;s graph. Dominant taste across that crowd:{" "}
              {profile.tasteTags.slice(0, 10).map((t) => t.name).join(", ")}.
            </p>
          </section>

          {fit ? (
            <section style={{ marginBottom: 22 }}>
              <h3>The read</h3>
              <p style={{ fontSize: 15.5, lineHeight: 1.55, margin: 0 }}>{fit.verdict}</p>
              <p className="tiny faint" style={{ marginTop: 10, marginBottom: 0 }}>
                Percentile {fit.percentile === null ? "n/a" : `${Math.round(fit.percentile * 100)}th`} within{" "}
                {room.name}&apos;s own top-{profile.acts.length} · raw Qloo affinity{" "}
                {fit.rawAffinity?.toFixed(4) ?? "n/a"}
              </p>
            </section>
          ) : null}

          {otherFits.length > 0 ? (
            <section style={{ marginBottom: 22 }}>
              <h3>The same act elsewhere</h3>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
                <thead>
                  <tr style={{ color: "var(--ink-faint)", fontSize: 11, letterSpacing: "0.08em", textTransform: "uppercase" }}>
                    <th style={{ textAlign: "left", padding: "6px 0", fontWeight: 500 }}>Room</th>
                    <th style={{ textAlign: "left", padding: "6px 0", fontWeight: 500 }}>City</th>
                    <th style={{ textAlign: "right", padding: "6px 0", fontWeight: 500 }}>Read</th>
                  </tr>
                </thead>
                <tbody>
                  {otherFits.map((f) => {
                    const r = ROOMS.find((x) => x.id === f.roomId);
                    const pct = f.percentile === null ? "—" : `${Math.round(f.percentile * 100)}th pct`;
                    const color = f.band === "core" ? "var(--good)" : f.band === "edge" ? "var(--warn)" : "var(--bad)";
                    return (
                      <tr key={f.roomId} style={{ borderTop: "1px solid var(--line)" }}>
                        <td style={{ padding: "8px 0" }}>{f.roomName}</td>
                        <td className="tiny faint" style={{ padding: "8px 0" }}>{r?.city}</td>
                        <td className="mono" style={{ padding: "8px 0", textAlign: "right", color }}>
                          {pct}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </section>
          ) : null}

          {sponsor && sponsor.confidence === "high" && sponsor.brands.length > 0 ? (
            <section style={{ marginBottom: 22 }}>
              <h3>Sponsorable categories</h3>
              <p className="dim" style={{ fontSize: 14.5, marginBottom: 8 }}>
                Brands whose audiences sit closest to this booking&apos;s audience:{" "}
                <strong style={{ color: "var(--ink)" }}>{sponsor.brands.slice(0, 10).map((b) => b.name).join(", ")}</strong>.
              </p>
              <p className="tiny faint" style={{ marginBottom: 0 }}>
                Audience overlap only. Not a value estimate.
              </p>
            </section>
          ) : null}

          <section>
            <h3>What this does not establish</h3>
            <ul className="tiny faint" style={{ lineHeight: 1.8, paddingLeft: 18, marginBottom: 0 }}>
              <li>Not a ticket-sales forecast. No capacity, pricing or guarantee modelling.</li>
              <li>Not a statement about any individual person — Qloo affinities are aggregate cultural co-occurrence.</li>
              <li>Audience overlap is not causation and not a market size.</li>
            </ul>
          </section>
        </>
      ) : (
        <div className="notice">
          Qloo has no taste signal for {room.name}. Roomtone will not produce a profile it cannot measure.
        </div>
      )}

      <footer style={{ borderTop: "1px solid var(--line)", marginTop: 26, paddingTop: 16 }}>
        <div className="tiny faint">
          Generated by Roomtone from Qloo&apos;s cultural graph ({calls.length} measured requests).{" "}
          <Link href="/method" style={{ color: "var(--ink-dim)" }}>
            Method and limits
          </Link>
        </div>
      </footer>
    </article>
  );
}