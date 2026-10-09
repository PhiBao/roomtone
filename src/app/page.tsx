import Link from "next/link";
import { FEATURED_ROOMS } from "@/lib/roomtone/catalog";

export default function Home() {
  return (
    <>
      <section style={{ paddingBottom: 8 }}>
        <p className="tiny" style={{ color: "var(--accent)", marginBottom: 16 }}>
          Cultural intelligence for live music
        </p>
        <h1>
          Every room has an audience.
          <br />
          <span className="dim">Almost nobody can tell you what it is.</span>
        </h1>
        <p className="lede">
          A promoter commits a guarantee on a feeling — usually their own. Roomtone reads a venue as a{" "}
          <em>taste object</em> using Qloo&apos;s cultural graph: who the room&apos;s local audience actually is, what
          they listen to, which acts belong to them, and which brands already reach them.
        </p>
        <p className="lede" style={{ fontSize: 16 }}>
          <strong style={{ color: "var(--ink)" }}>What it does not do</strong> — and we tested it: Roomtone does not
          predict draw. Qloo describes a room&apos;s local audience, not the touring acts that fill it. The{" "}
          <Link href="/benchmark" style={{ color: "var(--accent)" }}>
            benchmark
          </Link>{" "}
          that found that out is on the site, with the result that produced it.
        </p>
        <div className="row" style={{ marginTop: 24 }}>
          <Link href="/two-rooms" className="btn btn-primary">
            See it in one click
          </Link>
          <Link href="/read" className="btn">
            Read a room
          </Link>
        </div>
      </section>

      <hr className="rule" />

      <section className="stack" style={{ maxWidth: 760 }}>
        <div className="notice">
          <strong>What this is, and is not.</strong> Roomtone measures <strong>audience alignment</strong> — how
          close an act&apos;s audience sits to a room&apos;s actual crowd, on Qloo&apos;s affinity graph. It does
          not forecast ticket sales, and Qloo affinities describe aggregate cultural co-occurrence rather than any
          individual person. When a room genuinely isn&apos;t measurable, Roomtone says so instead of guessing.
        </div>
      </section>

      <hr className="rule" />

      <section>
        <div className="card-head">
          <h2 style={{ margin: 0 }}>{FEATURED_ROOMS.length} rooms, {FEATURED_ROOMS.length} different crowds</h2>
          <Link href="/rooms" className="btn btn-sm">
            All rooms
          </Link>
        </div>
        <p className="dim" style={{ maxWidth: "64ch" }}>
          These are real rooms whose audiences Qloo can measure. Open any of them to see the acts that most
          belong there — and, for several, rooms that share almost nothing with them.
        </p>
        <div className="grid grid-2" style={{ marginTop: 18 }}>
          {FEATURED_ROOMS.map((room) => (
            <Link key={room.id} href={`/rooms/${room.id}`} className="card" style={{ display: "block" }}>
              <div className="card-head">
                <h3 style={{ margin: 0 }}>{room.name}</h3>
                <span className="pill">{room.genre ?? "Venue"}</span>
              </div>
              <div className="tiny faint">
                {[room.neighborhood, room.city].filter(Boolean).join(" · ")}
              </div>
            </Link>
          ))}
        </div>
      </section>

      <hr className="rule" />

      <section>
        <h2>Why this didn&apos;t exist</h2>
        <div className="grid grid-3">
          <div className="card">
            <h3>The industry admitted the gap</h3>
            <p className="dim" style={{ fontSize: 14, marginBottom: 0 }}>
              In a January 2026 submission to the UK Parliament Business &amp; Trade Select Committee, Live Nation
              wrote that third-party live-music reporting is{" "}
              <em>&ldquo;self-reported, selective and incomplete&rdquo;</em>. Box office tells you what happened
              last night. Nothing tells you what tonight&apos;s room is.
            </p>
          </div>
          <div className="card">
            <h3>The bias is measurable</h3>
            <p className="dim" style={{ fontSize: 14, marginBottom: 0 }}>
              The documented failure mode is not bad taste, it is{" "}
              <em>substituted</em> taste: booking the artist you love into a market that doesn&apos;t share it.
              Audience Republic&apos;s founder lost $20,000 on 400 tickets against a 700-ticket break-even, and
              named the reason.
            </p>
          </div>
          <div className="card">
            <h3>Qloo has never been used this way</h3>
            <p className="dim" style={{ fontSize: 14, marginBottom: 0 }}>
              A taste graph spans music, film, books, restaurants and places. Used as a booking instrument it
              turns a venue from a capacity number into an audience — and the whole business changes around it.
            </p>
          </div>
        </div>
      </section>
    </>
  );
}