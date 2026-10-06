import { NextResponse } from "next/server";
import { qlooConfigured, cacheStats } from "@/lib/qloo/client";

export const dynamic = "force-dynamic";

/**
 * Liveness plus honest configuration state.
 *
 * Reports the credential as configured-or-not but never echoes any part of it,
 * so this endpoint is safe to expose for a platform health check.
 */
export function GET() {
  return NextResponse.json({
    ok: true,
    qloo_configured: qlooConfigured,
    cache_entries: cacheStats().entries,
    service: "roomtone",
  });
}
