"use client";

import { useEffect, useRef, useState } from "react";

export interface ActOption {
  id: string;
  name: string;
  disambiguation?: string;
  match?: "strong" | "weak";
}

/**
 * Act autocomplete that refuses to hide a bad match.
 *
 * Qloo maps "Nate Barbrack" to "Nate Dogg". If we auto-selected the top hit, the
 * resulting booking read would be confidently wrong — the exact failure this
 * product is meant to catch in promoters. So a weak match is labelled and never
 * auto-selected; the person has to choose.
 */
export function ActPicker({
  initial,
  name,
}: {
  initial?: ActOption;
  name?: string;
}) {
  const [q, setQ] = useState("");
  const [options, setOptions] = useState<ActOption[]>([]);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const term = q.trim();
    if (term.length < 2) {
      setOptions([]);
      return;
    }
    setBusy(true);
    const t = setTimeout(async () => {
      try {
        const res = await fetch(`/api/lookup?q=${encodeURIComponent(term)}`);
        const data = (await res.json()) as { acts?: ActOption[] };
        setOptions(data.acts ?? []);
        setOpen(true);
      } catch {
        setOptions([]);
      } finally {
        setBusy(false);
      }
    }, 260);
    return () => clearTimeout(t);
  }, [q]);

  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, []);

  if (initial) {
    return (
      <span className="row" style={{ gap: 8 }}>
        <span className="pill pill-core">{initial.name}</span>
        <a className="btn btn-sm" href={`/read`}>
          Change
        </a>
      </span>
    );
  }

  return (
    <div ref={boxRef} style={{ position: "relative" }}>
      <label className="field">
        <span className="field-label">Act</span>
        <input
          className="input"
          placeholder={name ?? "Try “Yves Tumor” or “Bill Frisell”"}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onFocus={() => options.length && setOpen(true)}
          autoComplete="off"
          aria-label="Search for an act"
        />
      </label>

      {busy ? (
        <span className="loading" aria-label="Searching" role="status" />
      ) : null}

      {open && options.length > 0 ? (
        <div
          className="card card-sunken"
          style={{ position: "absolute", zIndex: 20, left: 0, right: 0, top: "100%", padding: 6, marginTop: -6 }}
        >
          {options.slice(0, 7).map((a) => {
            const weak = a.match === "weak";
            return (
              <a
                key={a.id}
                className="act-row"
                href={`/read?act=${encodeURIComponent(a.id)}`}
                style={{ display: "block", padding: "9px 10px", borderBottom: "1px solid var(--line)" }}
              >
                <div className="row" style={{ gap: 8 }}>
                  <span className="act-name">{a.name}</span>
                  {weak ? <span className="pill pill-edge">closest match — confirm</span> : null}
                </div>
                {a.disambiguation ? <div className="act-sub">{a.disambiguation}</div> : null}
              </a>
            );
          })}
          <div className="tiny faint" style={{ padding: "8px 10px 4px" }}>
            Results from Qloo&apos;s graph. Pick the act you meant.
          </div>
        </div>
      ) : null}

      {!busy && q.trim().length >= 2 && options.length === 0 && !open ? (
        <div className="tiny faint" style={{ marginTop: 6 }}>
          No acts matched. Qloo covers ~600M entities, so try a different spelling.
        </div>
      ) : null}
    </div>
  );
}