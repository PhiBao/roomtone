import { Evidence } from "@/components/Evidence";

/**
 * The Method page.
 *
 * Two things decide this hackathon: whether the claims are real, and whether we
 * say what the tool cannot do. Both are cheaper to establish here than to be
 * asked about in the demo.
 */
export default function MethodPage() {
  return (
    <>
      <h1 style={{ fontSize: 34 }}>Method, and limits</h1>
      <p className="lede" style={{ marginBottom: 28 }}>
        Roomtone makes a narrow claim and states it precisely. This page is the whole contract.
      </p>

      <section className="card" style={{ marginBottom: 24 }}>
        <h2>What is measured</h2>
        <p className="dim">
          For a room <em>R</em> we ask Qloo for the 50 acts whose audiences sit closest to{" "}
          <em>R</em>&apos;s own crowd. That list is the room&apos;s <strong>local audience</strong>, expressed as
          names. This is a read of taste, not of draw — the benchmark page states the distinction with its evidence.
        </p>
        <p className="dim">
          For an act <em>A</em> and a room <em>R</em>, Roomtone reports where <em>A</em> falls inside{" "}
          <em>R</em>&apos;s own distribution of those 50 acts — a percentile — rather than the raw affinity number.
        </p>
        <p className="dim" style={{ marginBottom: 0 }}>
          The reason is that Qloo affinities are tightly banded. Every room&apos;s top 50 lands in roughly the top
          0.03 of the 0–1 scale, so a raw 0.94 means almost nothing on its own. The percentile does not:{" "}
          <strong>an act that is not in a room&apos;s top 50 is below all 50 acts that most belong there</strong>,
          which is a real and bounded statement.
        </p>
      </section>

      <section className="card" style={{ marginBottom: 24 }}>
        <h2>What is not measured</h2>
        <ul className="dim" style={{ lineHeight: 1.75, paddingLeft: 20, marginBottom: 0 }}>
          <li>
            <strong>Not draw, and not ticket sales.</strong> Qloo&apos;s room affinity describes a venue&apos;s
            local audience; it does not predict which touring acts will fill it. Tested against 149 documented
            plays: zero appeared in their venue&apos;s top 50, and ranking by popularity scored 0.995 on the same
            question. See the{" "}
            <a href="/benchmark" className="mono" style={{ color: "var(--ink)" }}>
              benchmark
            </a>
            .
          </li>
          <li>
            <strong>Not an individual.</strong> Qloo affinities describe aggregate cultural co-occurrence.
            Roomtone never infers anything about a specific person, and sends no personal data to Qloo at all.
          </li>
          <li>
            <strong>Not every room.</strong> Some venues exist in Qloo&apos;s graph with no audience coverage.
            Roomtone says &ldquo;Qloo has no taste signal for this room&rdquo; rather than producing a profile.
          </li>
          <li>
            <strong>Not cause and effect.</strong> A low affinity is a signal that two audiences differ. It is not
            proof that a show would fail.
          </li>
          <li>
            <strong>Not venue capacity or calendar fit.</strong> Roomtone reads culture, not logistics.
          </li>
        </ul>
      </section>

      <section className="card" style={{ marginBottom: 24 }}>
        <h2>Known measurement traps we hit</h2>
        <ul className="dim" style={{ lineHeight: 1.75, paddingLeft: 20, marginBottom: 0 }}>
          <li>
            <strong>Same-named venues.</strong> There is a dozen venues called &ldquo;The Stone&rdquo;. Qloo&apos;s
            <code className="mono"> /analysis/compare</code> silently resolved ours to a Denver club. Every room in
            the catalog is therefore pinned by id and verified against its own geocode; four candidate rooms were
            dropped rather than shown wrong.
          </li>
          <li>
            <strong>Entity mis-resolution.</strong> Qloo maps &ldquo;Nate Barbrack&rdquo; to &ldquo;Nate
            Dogg&rdquo;. An auto-selected top hit would have produced a confidently wrong booking read, so the
            picker labels weak matches and never auto-selects them.
          </li>
          <li>
            <strong>Missing data reads as zero.</strong> An early build reported a rate-limited request as
            &ldquo;not measured&rdquo;. Those are now separate states — a failed request throws rather than
            silently degrading.
          </li>
          <li>
            <strong>A capable endpoint that was not capable here.</strong>{" "}
            <code className="mono">/v2/analysis/compare</code> is documented for audience comparison and returns
            only universal place categories in the hackathon environment. Rather than display a confident score
            built on &ldquo;Tourist Attraction&rdquo;, we switched the measurement.
          </li>
          <li>
            <strong>Silently ignored parameters.</strong> Qloo ignores invalid parameters instead of erroring, so
            Roomtone pins ids explicitly and shows every request verbatim in the Evidence panel.
          </li>
        </ul>
      </section>

      <section className="card" style={{ marginBottom: 24 }}>
        <h2>Qloo endpoints used</h2>
        <div className="card card-sunken">
          <ul className="dim" style={{ fontSize: 14, lineHeight: 1.85, paddingLeft: 20, margin: 0 }}>
            <li>
              <code className="mono">/search</code> — resolve venue and act names to entity ids
            </li>
            <li>
              <code className="mono">/v2/insights</code> ·{" "}
              <code className="mono">filter.type=urn:entity:artist</code> — room → acts, act → acts, act → room
            </li>
            <li>
              <code className="mono">/v2/insights</code> ·{" "}
              <code className="mono">filter.type=urn:entity:place</code> — room → culturally adjacent rooms
            </li>
            <li>
              <code className="mono">/v2/analysis/compare</code> — available, but we stopped using it: in the
              hackathon environment it only returns generic place tags (&ldquo;Place&rdquo;, &ldquo;Tourist
              Attraction&rdquo;) that are true of every venue. Roomtone measures room-to-room overlap directly on
              act lists instead, which is both honest and legible.
            </li>
            <li>
              <code className="mono">/v2/audiences</code> — cold-start reads with no entity signal
            </li>
          </ul>
        </div>
      </section>

      <section className="card">
        <h2>If you want to check our work</h2>
        <p className="dim" style={{ marginBottom: 0 }}>
          Every Roomtone view carries an{" "}
          <strong style={{ color: "var(--ink)" }}>Evidence</strong> panel listing each Qloo request verbatim —
          endpoint, parameters, resolved entity ids, status, latency, result count and whether it was served from
          cache. If a number on this site disagrees with the request underneath it, that is a bug worth reporting.
        </p>
      </section>

      <div style={{ marginTop: 26 }}>
        <Evidence calls={[]} title="Evidence for this page" />
      </div>
    </>
  );
}