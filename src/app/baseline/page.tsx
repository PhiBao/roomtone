import Link from "next/link";
import { ROOMS, CITIES } from "@/lib/roomtone/catalog";
import { getRoomProfile } from "@/lib/roomtone/engine";
import { runBaseline, spearman, topN } from "@/lib/roomtone/baseline";
import { computeLift } from "@/lib/roomtone/lift";
import { buildBill, billSummary } from "@/lib/roomtone/bill";
import { Evidence } from "@/components/Evidence";
import type { QlooCall } from "@/lib/qloo/types";

export const dynamic = "force-dynamic";

/**
 * The ablation page.
 *
 * The hackathon brief says: "if your submission would work the same without
 * Qloo, you're building the wrong thing." This page is the answer, and it is
 * deliberately the harshest possible version of that test.
 *
 * Rather than pit Qloo against an LLM, we pit it against *the incumbent
 * method*: how a booker actually decides today, built properly from the same
 * entity data — rank by popularity, break ties by genre bucket. If that
 * heuristic produced the same shortlist Roomtone does, Roomtone would be
 * decoration. We show, per room, whether it does.
 */
export default async function BaselinePage() {
  const calls: QlooCall[] = [];

  const rows: {
    room: string;
    city: string;
    topRoomtone: string[];
    topPopularity: string[];
    rho: number;
    popAffinityRho: number;
    coverage: number;
    naiveCoverage: number;
    liftTop: string;
    liftWorst: string;
    ok: boolean;
  }[] = [];

  for (const room of ROOMS) {
    try {
      const profile = await getRoomProfile(room.id, 50);
      if (profile.unmeasured) continue;
      calls.push(...profile.calls);

      const baseline = await runBaseline(room.id, 50);
      calls.push(...baseline.calls);

      const rho = spearman(
        topN(profile.acts, 50),
        baseline.ranking.map((r) => r.act.entity_id),
      );

      const lift = await computeLift(room.id);
      calls.push(...lift.calls);

      const bill = buildBill(profile.acts, { size: 5 });

      rows.push({
        room: room.name,
        city: [room.neighborhood, room.city].filter(Boolean).join(", "),
        topRoomtone: profile.acts.slice(0, 5).map((a) => a.name),
        topPopularity: baseline.byPopularity.slice(0, 5).map((a) => a.name),
        rho: Number.isNaN(rho) ? 0 : rho,
        popAffinityRho: Number.isNaN(lift.popularityCorrelation) ? 0 : lift.popularityCorrelation,
        coverage: bill.coverage,
        naiveCoverage: bill.coverageOfNaive,
        liftTop: lift.acts[0] ? `${lift.acts[0].name} ${lift.acts[0].lift > 0 ? "+" : ""}${lift.acts[0].lift.toFixed(4)}` : "—",
        liftWorst: lift.acts.length ? `${lift.acts[lift.acts.length - 1]!.name} ${lift.acts[lift.acts.length - 1]!.lift.toFixed(4)}` : "—",
        ok: true,
      });
    } catch {
      /* an unreachable room must not sink the page */
    }
  }

  const measured = rows.length;
  // Weak agreement means the taste graph is adding information the incumbent
  // method does not have. Report the median so one outlier room can't flatter us.
  const rhos = rows.map((r) => Math.abs(r.rho)).sort((a, b) => a - b);
  const medianAbsRho = rhos.length ? rhos[Math.floor(rhos.length / 2)]! : 0;
  const uncorrelated = rows.filter((r) => Math.abs(r.rho) < 0.2).length;
  const covSum = rows.reduce((s, r) => s + r.coverage, 0);
  const naiveSum = rows.reduce((s, r) => s + r.naiveCoverage, 0);
  const avgGain = measured ? (covSum - naiveSum) / measured : 0;

  return (
    <>
      <h1 style={{ fontSize: 34 }}>Why this needs Qloo</h1>
      <p className="lede" style={{ marginBottom: 22 }}>
        The brief is explicit: <em>&ldquo;if your submission would work the same without Qloo, you&apos;re building
        the wrong thing.&rdquo;</em> So we built the alternative properly and measured it.
      </p>

      <section className="card" style={{ marginBottom: 26 }}>
        <h3 style={{ marginBottom: 8 }}>The incumbent method, built properly</h3>
        <p className="dim" style={{ fontSize: 14.5 }}>
          A booker deciding who plays a room today works from two things: <strong>popularity</strong> (whose
          numbers are big) and <strong>genre bucket</strong> (is this act in this venue&apos;s category). That is the
          whole heuristic, and we gave it the best form its logic allows — same candidate pool as Roomtone, same
          entity data, no taste-graph signal anywhere. Popularity only.
        </p>
        <p className="dim" style={{ fontSize: 14.5, marginBottom: 0 }}>
          Qloo <em>does</em> return each entity&apos;s popularity percentile, so the baseline is cheap to compute
          honestly. What it has no access to is the one thing Qloo actually sells: <strong>who listens to
          what</strong>.
        </p>
      </section>

      {measured > 0 ? (
        <>
          <section className="grid grid-3" style={{ marginBottom: 30 }}>
            <div className="card card-sunken">
              <div className="tiny faint" style={{ marginBottom: 6 }}>Median rank correlation</div>
              <div style={{ fontSize: 34, fontWeight: 650, letterSpacing: "-0.03em" }}>
                ρ = {medianAbsRho.toFixed(2)}
              </div>
              <p className="tiny faint" style={{ marginTop: 8, marginBottom: 0 }}>
                Across {measured} measured rooms. ρ = 1 would mean popularity alone reproduces Roomtone exactly,
                and Roomtone adds nothing.
              </p>
            </div>
            <div className="card card-sunken">
              <div className="tiny faint" style={{ marginBottom: 6 }}>Rooms where they disagree</div>
              <div style={{ fontSize: 34, fontWeight: 650, letterSpacing: "-0.03em" }}>
                {uncorrelated} / {measured}
              </div>
              <p className="tiny faint" style={{ marginTop: 8, marginBottom: 0 }}>
                Rooms where |ρ| &lt; 0.2 — the two methods are essentially unrelated on which acts to book.
              </p>
            </div>
            <div className="card card-sunken">
              <div className="tiny faint" style={{ marginBottom: 6 }}>Coverage gained per bill</div>
              <div style={{ fontSize: 34, fontWeight: 650, letterSpacing: "-0.03em" }}>
                {(avgGain * 100).toFixed(0)} pts
              </div>
              <p className="tiny faint" style={{ marginTop: 8, marginBottom: 0 }}>
                Audience coverage from a bill built for redundancy vs simply booking the top acts. See
                <Link href="/bill" style={{ color: "var(--ink-dim)" }}> the bill builder</Link>.
              </p>
            </div>
          </section>

          <section className="card" style={{ marginBottom: 30 }}>
            <h3 style={{ marginBottom: 10 }}>Every measured room, side by side</h3>
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13.5 }}>
                <thead>
                  <tr style={{ color: "var(--ink-faint)", fontSize: 11, letterSpacing: "0.06em", textTransform: "uppercase" }}>
                    <th style={{ textAlign: "left", padding: "8px 10px 8px 0", fontWeight: 500 }}>Room</th>
                    <th style={{ textAlign: "left", padding: 8, fontWeight: 500 }}>Roomtone&apos;s read</th>
                    <th style={{ textAlign: "left", padding: 8, fontWeight: 500 }}>Popularity ranking</th>
                    <th style={{ textAlign: "right", padding: 8, fontWeight: 500 }}>ρ</th>
                    <th style={{ textAlign: "right", padding: 8, fontWeight: 500 }}>Pop↔affinity</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => {
                    const weak = Math.abs(r.rho) < 0.2;
                    return (
                      <tr key={r.room} style={{ borderTop: "1px solid var(--line)" }}>
                        <td style={{ padding: "10px 10px 10px 0" }}>
                          <div>{r.room}</div>
                          <div className="tiny faint">{r.city}</div>
                        </td>
                        <td className="dim" style={{ padding: 10, verticalAlign: "top" }}>
                          {r.topRoomtone.slice(0, 3).join(", ")}
                        </td>
                        <td className="faint" style={{ padding: 10, verticalAlign: "top" }}>
                          {r.topPopularity.slice(0, 3).join(", ")}
                        </td>
                        <td className="mono" style={{ padding: 10, textAlign: "right", color: weak ? "var(--good)" : "var(--warn)" }}>
                          {r.rho.toFixed(2)}
                        </td>
                        <td className="mono faint" style={{ padding: 10, textAlign: "right" }}>
                          {r.popAffinityRho.toFixed(2)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <p className="tiny faint" style={{ marginTop: 12, marginBottom: 0 }}>
              ρ is Spearman rank correlation between Roomtone&apos;s ordering and the incumbent method&apos;s.
              The last column is the popularity↔affinity correlation <em>inside</em> the room — how much of Qloo&apos;s
              raw affinity is really just fame. That is the bias the lift metric removes.
            </p>
          </section>

          <section className="card">
            <h3 style={{ marginBottom: 8 }}>How to read the disagreement</h3>
            <p className="dim" style={{ fontSize: 14.5 }}>
              Where ρ is high, popularity happens to be a good proxy — a room whose crowd is the mainstream of its
              genre. Where ρ collapses, the two methods are ranking different acts, and one of them is wrong. The
              useful case is a room where popularity is actively misleading: the acts that draw a Webster Hall
              crowd are not the acts with the biggest numbers.
            </p>
            <p className="dim" style={{ fontSize: 14.5, marginBottom: 0 }}>
              <strong style={{ color: "var(--ink)" }}>What this does not prove.</strong> A low correlation is not a
              box-office result. It says the incumbent heuristic and the taste-graph read disagree about who
              belongs in a room — the disagreement itself is the evidence that Qloo is doing work, and the room
              read is checkable by anyone who knows the venue. We are not forecasting ticket sales anywhere on
              this site.
            </p>
          </section>
        </>
      ) : (
        <div className="notice">No rooms were measurable. Try again once Qloo responds.</div>
      )}

      <div style={{ marginTop: 30 }}>
        <Evidence calls={calls} title="Qloo provenance for every number above" />
      </div>

      <div className="row" style={{ marginTop: 20 }}>
        <Link href="/bill" className="btn btn-primary">
          The bill builder →
        </Link>
        <Link href="/two-rooms" className="btn">
          Two Rooms
        </Link>
      </div>
    </>
  );
}