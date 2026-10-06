import type { QlooCall } from "@/lib/qloo/types";

/**
 * The Evidence panel.
 *
 * Every number Roomtone shows came from a specific, logged Qloo request. We
 * render those requests verbatim — endpoint, parameters, resolved entity ids,
 * latency, result count, cache state — so a reader can check our work instead of
 * taking it on faith. This is the difference between a taste claim and a taste
 * measurement.
 */
export function Evidence({ calls, title = "Evidence" }: { calls: QlooCall[]; title?: string }) {
  const rows = dedupe(calls);
  const cached = rows.filter((r) => r.cache !== "miss").length;

  return (
    <details className="evidence">
      <summary>
        <span aria-hidden="true">▸</span>
        <span>
          {title} — {rows.length} Qloo {rows.length === 1 ? "request" : "requests"}
          {cached > 0 ? ` · ${cached} served from cache` : ""}
        </span>
      </summary>
      <div>
        {rows.length === 0 ? (
          <div className="call-row">No Qloo calls were needed for this view.</div>
        ) : (
          rows.map((c) => <CallRow key={c.id} call={c} />)
        )}
      </div>
    </details>
  );
}

function dedupe(calls: QlooCall[]): QlooCall[] {
  const seen = new Set<string>();
  const out: QlooCall[] = [];
  for (const c of calls) {
    const key = `${c.method} ${c.path} ${JSON.stringify(c.params)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(c);
  }
  return out;
}

function CallRow({ call }: { call: QlooCall }) {
  const params = Object.entries(call.params);
  const labels = Object.entries(call.labels ?? {});
  return (
    <div className="call-row">
      <div>
        <span className="call-method">{call.method}</span> {call.path}
        <span style={{ color: "var(--ink-faint)" }}>
          {"  "}→ {call.status} · {call.resultCount} results · {call.durationMs}ms ·{" "}
        </span>
        <span className={`call-cache-${call.cache}`}>{call.cache}</span>
      </div>
      {call.note ? (
        <div style={{ color: "var(--ink-faint)" }}>
          {call.note}
        </div>
      ) : null}
      {params.length > 0 ? (
        <div>
          {params.map(([k, v]) => (
            <span key={k} style={{ marginRight: 14 }}>
              <span style={{ color: "var(--ink-faint)" }}>{k}=</span>
              <span>{v.length > 96 ? `${v.slice(0, 96)}…` : v}</span>
            </span>
          ))}
        </div>
      ) : null}
      {labels.length > 0 ? (
        <div style={{ color: "var(--ink-faint)" }}>
          {labels.map(([id, name]) => (
            <span key={id} style={{ marginRight: 14 }}>
              {id} = <span style={{ color: "var(--cool)" }}>{name}</span>
            </span>
          ))}
        </div>
      ) : null}
    </div>
  );
}