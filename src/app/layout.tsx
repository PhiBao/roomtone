import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  title: "Roomtone — every room has an audience",
  description:
    "Roomtone reads a venue or neighbourhood as a taste object using Qloo's cultural graph, so a promoter can see who is actually in the room before committing a guarantee.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <header className="masthead">
          <div className="shell masthead-inner">
            <Link href="/" className="wordmark">
              <span className="wordmark-dot" aria-hidden="true" />
              Roomtone
            </Link>
            <nav>
              <Link href="/rooms">Rooms</Link>
              <Link href="/desk">Booking Desk</Link>
              <Link href="/two-rooms">Two Rooms</Link>
              <Link href="/method">Method</Link>
            </nav>
          </div>
        </header>
        <main className="shell">{children}</main>
        <footer
          style={{
            borderTop: "1px solid var(--line)",
            marginTop: 72,
            padding: "26px 0 48px",
            fontSize: 12.5,
            color: "var(--ink-faint)",
            lineHeight: 1.7,
          }}
        >
          <div className="shell">
            <p style={{ marginBottom: 6 }}>
              Roomtone measures <strong>audience alignment</strong>, not ticket sales. Qloo affinities describe
              aggregate cultural co-occurrence, never an individual person. No personal data is sent to Qloo.
            </p>
            <p>
              Built for the Qloo Agentic Hackathon · Cultural data by{" "}
              <a href="https://qloo.com" style={{ color: "var(--ink-dim)" }}>
                Qloo
              </a>
            </p>
          </div>
        </footer>
      </body>
    </html>
  );
}