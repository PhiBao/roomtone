"use client";

import { useState } from "react";
import { Evidence } from "./Evidence";
import type { QlooCall } from "@/lib/qloo/types";

interface Answer {
  question: string;
  headline: string;
  detail: string[];
  recommendations: { name: string; why: string }[];
  caveats: string[];
  steps: { tool: string; args: Record<string, unknown>; status: string; summary: string; calls: QlooCall[] }[];
  calls: QlooCall[];
}

const EXAMPLES = [
  "Should I book Bad Bunny at Webster Hall?",
  "Who draws Radio City Music Hall?",
  "Does Yves Tumor fit The Stone?",
  "What brands sponsor a Bad Bunny show?",
  "What should I book at Pier 36?",
];

export function BookingDesk() {
  const [q, setQ] = useState(EXAMPLES[0]!);
  const [answer, setAnswer] = useState<Answer | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function run(question: string) {
    const text = question.trim();
    if (!text) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/desk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ q: text }),
      });
      const data = await res.json();
      if (!res.ok) setError(data?.error ?? `Request failed (${res.status})`);
      else setAnswer(data as Answer);
    } catch {
      setError("Could not reach the Booking Desk. Check your connection and retry.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="stack">
      <form
        className="card"
        onSubmit={(e) => {
          e.preventDefault();
          void run(q);
        }}
      >
        <label className="field" style={{ marginBottom: 10 }}>
          <span className="field-label">Ask the Booking Desk</span>
          <input
            className="input"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Should I book Bad Bunny at Webster Hall?"
            maxLength={240}
            aria-label="Booking question"
          />
        </label>
        <div className="row">
          <button className="btn btn-primary" type="submit" disabled={busy}>
            {busy ? <span className="loading" /> : null} Read this booking
          </button>
          <span className="tiny faint">
            Deterministic. Same question, same answer — it runs fixed tools, it doesn&apos;t improvise.
          </span>
        </div>
        <div className="row" style={{ marginTop: 14 }}>
          {EXAMPLES.map((ex) => (
            <button key={ex} type="button" className="pill" style={{ cursor: "pointer" }} onClick={() => { setQ(ex); void run(ex); }}>
              {ex}
            </button>
          ))}
        </div>
      </form>

      {error ? (
        <div className="notice notice-danger">
          {error}
        </div>
      ) : null}

      {answer ? (
        <>
          <div className="card">
            <div className="tiny faint" style={{ marginBottom: 8 }}>
              Answer
            </div>
            <h2 style={{ marginBottom: 14 }}>{answer.headline}</h2>
            {answer.detail.map((d, i) => (
              <p key={i} className="dim" style={{ maxWidth: "70ch" }}>
                {d}
              </p>
            ))}

            {answer.recommendations.length > 0 ? (
              <>
                <hr className="rule" style={{ margin: "20px 0 16px" }} />
                <h3>Named acts</h3>
                <ul className="act-list">
                  {answer.recommendations.map((r) => (
                    <li className="act-row" key={r.name}>
                      <span />
                      <span>
                        <span className="act-name">{r.name}</span>
                        <div className="act-sub">{r.why}</div>
                      </span>
                      <span />
                    </li>
                  ))}
                </ul>
              </>
            ) : null}

            {answer.caveats.length > 0 ? (
              <div style={{ marginTop: 20 }}>
                {answer.caveats.map((c, i) => (
                  <div className="notice" key={i} style={{ marginBottom: 8 }}>
                    {c}
                  </div>
                ))}
              </div>
            ) : null}
          </div>

          <details className="evidence">
            <summary>
              <span aria-hidden="true">▸</span>
              <span>What the agent actually did — {answer.steps.length} tool calls</span>
            </summary>
            <div>
              {answer.steps.map((s, i) => (
                <div className="call-row" key={i}>
                  <div>
                    <span
                      className="call-method"
                      style={{
                        color:
                          s.status === "ok" ? "var(--good)" : s.status === "empty" ? "var(--warn)" : "var(--bad)",
                      }}
                    >
                      {s.status.toUpperCase()}
                    </span>{" "}
                    <strong>{s.tool}</strong>{" "}
                    <span style={{ color: "var(--ink-faint)" }}>
                      {Object.entries(s.args).map(([k, v]) => `${k}=${v}`).join(" ")}
                    </span>
                  </div>
                  <div style={{ color: "var(--ink-faint)" }}>{s.summary}</div>
                </div>
              ))}
            </div>
          </details>

          <Evidence calls={answer.calls} title="Qloo provenance" />
        </>
      ) : null}
    </div>
  );
}