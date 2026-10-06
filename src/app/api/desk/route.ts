import { NextResponse } from "next/server";
import { ask } from "@/lib/agent/desk";
import { qlooConfigured } from "@/lib/qloo/client";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const MAX_LEN = 240;

/**
 * The Booking Desk endpoint.
 *
 * Deliberately a plain POST: the agent is deterministic, there is no model key
 * to leak and no prompt to inject. Input is length-capped and only ever used to
 * look entities up in Qloo — never forwarded anywhere else.
 */
export async function POST(req: Request) {
  let body: { q?: string };
  try {
    body = (await req.json()) as { q?: string };
  } catch {
    return NextResponse.json({ error: "Send JSON with a `q` field." }, { status: 400 });
  }

  const q = (body.q ?? "").trim().slice(0, MAX_LEN);
  if (!q) return NextResponse.json({ error: "Ask something." }, { status: 400 });
  if (!qlooConfigured) {
    return NextResponse.json(
      { error: "QLOO_API_KEY is not configured on the server, so the Booking Desk cannot measure anything." },
      { status: 503 },
    );
  }

  try {
    const answer = await ask(q);
    return NextResponse.json(answer);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "The Booking Desk failed." },
      { status: 502 },
    );
  }
}