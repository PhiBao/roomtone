import { NextResponse } from "next/server";
import { resolveAct, resolveRoom } from "@/lib/roomtone/engine";
import { QlooError } from "@/lib/qloo/client";

export const dynamic = "force-dynamic";

/** Act autocomplete. Returns candidates plus a match-strength flag so the UI can
 *  refuse to silently accept a wrong entity. */
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const q = (searchParams.get("q") ?? "").trim();
  if (q.length < 2) return NextResponse.json({ acts: [] });

  try {
    const r = await resolveAct(q);
    return NextResponse.json({
      acts: [{ id: r.id, name: r.name, disambiguation: r.disambiguation, match: r.match }, ...r.alternatives],
    });
  } catch (err) {
    const status = err instanceof QlooError ? err.status || 502 : 500;
    return NextResponse.json({ error: err instanceof Error ? err.message : "search failed", acts: [] }, { status });
  }
}

/** Free-text room lookup for rooms outside the curated catalog. */
export async function POST(req: Request) {
  let body: { q?: string };
  try {
    body = (await req.json()) as { q?: string };
  } catch {
    return NextResponse.json({ error: "invalid body" }, { status: 400 });
  }
  const q = (body.q ?? "").trim();
  if (q.length < 2) return NextResponse.json({ rooms: [] });

  try {
    const r = await resolveRoom(q);
    return NextResponse.json({ rooms: r ? [r.room, ...r.alternatives] : [] });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "search failed", rooms: [] }, { status: 502 });
  }
}