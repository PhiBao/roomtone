import Link from "next/link";
import { ROOMS } from "@/lib/roomtone/catalog";
import { getRoomProfile } from "@/lib/roomtone/engine";
import { buildBill, billSummary } from "@/lib/roomtone/bill";
import { computeLift } from "@/lib/roomtone/lift";
import { Evidence } from "@/components/Evidence";
import type { QlooCall } from "@/lib/qloo/types";

export const dynamic = "force-dynamic";

/**
 * The bill builder.
 *
 * The only page that runs a real algorithm. Choosing who plays a room is a set
 * problem, not a ranking problem, and the obvious answer — take the top five —
 * buys duplication. This solves maximum audience coverage under redundancy and
 * reports the number next to what the obvious answer would have got.
 */
export default async function BillPage() {
  const calls: QlooCall[] = [];
  const rooms = ROOMS;

  const results: {
    id: string;
    name: string;
    city: string;
    bill: ReturnType<typeof buildBill>;
    liftTop: { name: string; lift: number } | null;
  }[] = [];

  for (const room of rooms) {
    try {
      const profile = await getRoomProfile(room.id, 50);
      if (profile.unmeasured) continue;
      calls.push(...profile.calls);
      const bill = buildBill(profile.acts, { size: 5 });
      const lift = await computeLift(room.id);
      calls.push(...lift.calls);
      results.push({
        id: room.id,
        name: room.name,
        city: [room.neighborhood, room.city].filter(Boolean).join(", "),
        bill,
        liftTop: lift.acts[0] ? { name: lift.acts[0].name, lift: lift.acts[0].lift } : null,
      });
    } catch {
      /* skip unreachable */
    }
  }

  const avgGain = results.length
    ? results.reduce((s, r) => s + (r.bill.coverage - r.bill.coverageOfNaive), 0) / results.length
    : 0;

  return (
    <>
      <h1 style={{ fontSize: 34 }}>The bill builder</h1>
      <p className="lede" style={{ marginBottom: 24 }}>
        Booking a room is a set problem, not a ranking problem. Two acts who draw the same crowd are a
        duplication, not a strength — and the obvious answer, book the top five, buys you duplication. This
        chooses a bill for coverage and shows what it beats.
      </p>

      <section className="card" style={{ marginBottom: 28 }}>
        <h3 style={{ marginBottom: 8 }}>The algorithm</h3>
        <p className="dim" style={{ fontSize: 14.5 }}>
          Each act becomes a footprint of its significant taste tags — audience, genre, style, theme. The
          room&apos;s audience signature is the affinity-weighted union of those footprints across the acts that
          draw the room. A bill is then chosen by <strong>greedy maximum coverage</strong>: at each step, add the act
          that covers the most uncovered signature, weighted.
        </p>
        <p className="dim" style={{ fontSize: 14.5, marginBottom: 0 }}>
          Coverage under weights is monotone submodular, which is the condition where greedy carries a
          (1 − 1/e) ≈ 63% approximation bound — so the result is defensible, not just plausible. Every step is
          deterministic and every pick&apos;s marginal contribution is shown, so the bill can be argued with.
        </p>
      </section>

      {results.length > 0 ? (
        <>
          <section className="card" style={{ marginBottom: 30 }}>
            <div className="tiny faint" style={{ marginBottom: 6 }}>Average gain over booking the top five</div>
            <div style={{ fontSize: 34, fontWeight: 650, letterSpacing: "-0.03em" }}>
              {(avgGain * 100).toFixed(1)} points
            </div>
            <p className="tiny faint" style={{ marginTop: 8, marginBottom: 0 }}>
              Audience coverage across {results.length} rooms, coverage-bill vs affinity-ranked bill.
            </p>
          </section>

          <div className="grid grid-2">
            {results.map((r) => (
              <div className="card card-sunken" key={r.id}>
                <div className="card-head">
                  <h3 style={{ margin: 0 }}>{r.name}</h3>
                  <span className="pill">{r.bill.picks.length} acts</span>
                </div>
                <div className="tiny faint" style={{ marginBottom: 12 }}>{r.city}</div>
                <ul className="act-list">
                  {r.bill.picks.map((p, i) => (
                    <li className="act-row" key={p.act.entity_id} style={{ gridTemplateColumns: "22px 1fr auto" }}>
                      <span className="act-rank">{i + 1}</span>
                      <span>
                        <span className="act-name">{p.act.name}</span>
                        <div className="act-sub">{p.why}</div>
                      </span>
                      <span className="act-aff">+{(p.marginalCoverage * 100).toFixed(0)}%</span>
                    </li>
                  ))}
                </ul>
                <div className="row" style={{ marginTop: 12, justifyContent: "space-between" }}>
                  <span className="tiny faint">
                    coverage {(r.bill.coverage * 100).toFixed(0)}% vs naive {(r.bill.coverageOfNaive * 100).toFixed(0)}%
                  </span>
                  <span className="tiny faint">redundancy {(r.bill.redundancy * 100).toFixed(0)}%</span>
                </div>
              </div>
            ))}
          </div>
        </>
      ) : (
        <div className="notice">No rooms were measurable.</div>
      )}

      <div style={{ marginTop: 30 }}>
        <Evidence calls={calls} />
      </div>

      <div className="row" style={{ marginTop: 20 }}>
        <Link href="/baseline" className="btn btn-primary">
          Why this needs Qloo →
        </Link>
      </div>
    </>
  );
}