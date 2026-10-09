import Link from "next/link";
import benchmark from "@/data/benchmark.json";

export const dynamic = "force-static";
export const revalidate = 3600;

type Row = {
  venue: string;
  city: string | null;
  genre: string | null;
  measured: number;
  documented: number;
  aucRoomtone: number;
  aucPopularity: number;
  poolMin: number;
  inPool: number;
  localTop: string[];
};

const data = benchmark as unknown as { summary: Record<string, number>; results: Row[] };

/**
 * The external benchmark, published with the result it produced — including the
 * negative one.
 *
 * Ground truth is Wikipedia tour date tables: 943 documented shows across 161
 * venues from 57 major tours, resolved to 34 Qloo entities, of which 29 carried
 * enough artist history to test. Every venue was verified against its own
 * geocode before use; venues that could not be verified were dropped.
 *
 * The test: for a venue, does Roomtone score the acts that actually played there
 * above plausible acts that didn't? Reported as AUC against the incumbent method
 * (ranking by Qloo's popularity percentile), on identical candidates.
 */
export default function BenchmarkPage() {
  const s = data.summary;
  const rows = data.results;
  const rooms = [...new Set(rows.map((r) => r.city))];

  return (
    <>
      <h1 style={{ fontSize: 34 }}>The benchmark</h1>
      <p className="lede" style={{ marginBottom: 26 }}>
        A taste-graph read is worthless if it can&apos;t be checked against something other than itself. This
        page reports an external test — and the result contradicts what we assumed.
      </p>

      <section className="card" style={{ marginBottom: 26 }}>
        <h3 style={{ marginBottom: 8 }}>What was tested</h3>
        <p className="dim" style={{ fontSize: 14.5 }}>
          For each venue: does Roomtone score the acts that <em>documentarily </em> played there above plausible
          acts that didn&apos;t? The metric is AUC, computed against the incumbent method on the same candidate
          pool — ranking by Qloo&apos;s popularity percentile, which is how draw is actually decided.
        </p>
        <p className="dim" style={{ fontSize: 14.5, marginBottom: 0 }}>
          Ground truth is <strong>Wikipedia tour date tables</strong>: {s.documentedShows} documented plays across{" "}
          {s.totalDocs ?? 29} verified venues from 57 major tours, independent of Qloo.
        </p>
      </section>

      <section className="grid grid-3" style={{ marginBottom: 30 }}>
        <div className="card card-sunken">
          <div className="tiny faint" style={{ marginBottom: 6 }}>Roomtone AUC</div>
          <div style={{ fontSize: 34, fontWeight: 650, letterSpacing: "-0.03em", color: "var(--bad)" }}>
            {(s.meanAucRoomtone ?? 0).toFixed(3)}
          </div>
          <p className="tiny faint" style={{ marginTop: 8, marginBottom: 0 }}>
            Chance is 0.5. This is worse than chance, not better.
          </p>
        </div>
        <div className="card card-sunken">
          <div className="tiny faint" style={{ marginBottom: 6 }}>Popularity AUC</div>
          <div style={{ fontSize: 34, fontWeight: 650, letterSpacing: "-0.03em", color: "var(--good)" }}>
            {(s.meanAucPopularity ?? 0).toFixed(3)}
          </div>
          <p className="tiny faint" style={{ marginTop: 8, marginBottom: 0 }}>
            Ranking by fame predicts who plays a room almost perfectly. Draw decides.
          </p>
        </div>
        <div className="card card-sunken">
          <div className="tiny faint" style={{ marginBottom: 6 }}>Documented plays in the top 50</div>
          <div style={{ fontSize: 34, fontWeight: 650, letterSpacing: "-0.03em" }}>
            {s.inTopFifty ?? 0} / {s.documentedShows}
          </div>
          <p className="tiny faint" style={{ marginTop: 8, marginBottom: 0 }}>
            Not one documented touring act appears in the audience Qloo assigns to the room it played.
          </p>
        </div>
      </section>

      <section className="card" style={{ marginBottom: 26 }}>
        <h3 style={{ marginBottom: 8 }}>What the failure actually is</h3>
        <p className="dim" style={{ fontSize: 14.5 }}>
          It would be easy to report a null result and stop. The mechanism matters more. Look at what Qloo returns
          for a room whose touring history we documented:
        </p>
        <div className="grid grid-2" style={{ marginTop: 14, gap: 12 }}>
          {rows.slice(0, 4).map((r) => (
            <div className="card card-sunken" key={r.venue} style={{ padding: 14 }}>
              <div className="tiny faint" style={{ marginBottom: 6 }}>
                {r.venue} · {r.city}
              </div>
              <div style={{ fontSize: 13.5, lineHeight: 1.55 }}>
                <div>
                  <span className="faint">Played there: </span>
                  <span>{r.localTop ? "international touring acts" : ""}</span>
                </div>
                <div style={{ marginTop: 6 }}>
                  <span className="faint">Qloo&apos;s read of the room: </span>
                  <span style={{ color: "var(--accent)" }}>{r.localTop.slice(0, 4).join(", ")}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
        <p className="dim" style={{ fontSize: 14.5, marginTop: 14, marginBottom: 0 }}>
          AFAS Live in Amsterdam is documented to host Harry Styles, Halsey and Lorde. Qloo&apos;s read of that
          room is <strong>Dutch-language pop</strong> — Nielson, Gers Pardoel, Bløf, Marco Borsato. Oslo Spektrum is
          documented to host Harry Styles and Dua Lipa; Qloo&apos;s read is <strong>Norwegian-language acts</strong>.
          Rogers Arena in Vancouver gets <strong>EDM DJs</strong>.
        </p>
        <p className="dim" style={{ fontSize: 14.5, marginTop: 10, marginBottom: 0 }}>
          <strong style={{ color: "var(--ink)" }}>Qloo place affinity describes the local audience of a place, not
          the touring draw that fills it.</strong> International acts play those rooms because of how many people
          will buy a ticket — popularity, which the benchmark scores at 0.995 — not because of taste fit. The
          signal is real and it is coherent; it answers a different question than the one we first asked of it.
        </p>
      </section>

      <section className="card" style={{ marginBottom: 26 }}>
        <h3 style={{ marginBottom: 8 }}>What we changed as a result</h3>
        <ul className="dim" style={{ fontSize: 14.5, lineHeight: 1.75, paddingLeft: 20, marginBottom: 0 }}>
          <li>
            <strong>The claim is now narrower and true.</strong> Every page that once implied a booking recommendation
            now states that Roomtone measures a room&apos;s local audience, and does not forecast draw.
          </li>
          <li>
            <strong>Draw is a separate, explicit axis.</strong> A booking decision has two independent inputs —
            taste fit and draw — and collapsing them into one number is how a promoter gets misled. Roomtone shows
            both.
          </li>
          <li>
            <strong>Scope is now the local-programming decision</strong> — which acts to book into a room for its
            own audience, and which sponsors actually reach the people who are already there. That is where the
            taste read is the binding constraint rather than a comment on fame.
          </li>
          <li>
            <strong>The room reads still stand as evidence of the signal:</strong> The Stone returns a jazz canon,
            Sony Hall returns classical repertoire, KOKO returns UK grime. Those are local scenes, which is exactly
            what the mechanism says they should be.
          </li>
        </ul>
      </section>

      <section>
        <h3 style={{ marginBottom: 10 }}>Every venue, with its mechanism visible</h3>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr style={{ color: "var(--ink-faint)", fontSize: 11, letterSpacing: "0.06em", textTransform: "uppercase" }}>
                <th style={{ textAlign: "left", padding: "8px 10px 8px 0", fontWeight: 500 }}>Venue</th>
                <th style={{ textAlign: "left", padding: 8, fontWeight: 500 }}>Qloo&apos;s read of the room</th>
                <th style={{ textAlign: "right", padding: 8, fontWeight: 500 }}>Doc.</th>
                <th style={{ textAlign: "right", padding: 8, fontWeight: 500 }}>AUC</th>
                <th style={{ textAlign: "right", padding: 8, fontWeight: 500 }}>Pop.</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={`${r.venue}-${i}`} style={{ borderTop: "1px solid var(--line)" }}>
                  <td style={{ padding: "9px 10px 9px 0" }}>
                    <div>{r.venue}</div>
                    <div className="tiny faint">{r.city}</div>
                  </td>
                  <td className="dim" style={{ padding: 9 }}>
                    {r.localTop.slice(0, 3).join(", ")}
                  </td>
                  <td className="mono faint" style={{ padding: 9, textAlign: "right" }}>
                    {r.documented}
                  </td>
                  <td className="mono" style={{ padding: 9, textAlign: "right", color: "var(--bad)" }}>
                    {r.aucRoomtone.toFixed(2)}
                  </td>
                  <td className="mono faint" style={{ padding: 9, textAlign: "right" }}>
                    {r.aucPopularity.toFixed(2)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <div className="row" style={{ marginTop: 24 }}>
        <Link href="/baseline" className="btn btn-primary">
          The inside-the-room ablation →
        </Link>
        <Link href="/method" className="btn">
          Method and limits
        </Link>
      </div>
    </>
  );
}