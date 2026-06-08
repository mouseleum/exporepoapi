import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase";
import { syncAllSignals } from "@/lib/hubspot/sync";

export const runtime = "nodejs";
// HubSpot sync iterates per matched company and is sequential under the hood
// (each company hits the 1 + 4 contact-engagement + deals call sequence).
// 300s is the max for Vercel hobby; raise if a portal regularly times out.
export const maxDuration = 300;

// Phase 9: kicked by the "Sync now" button on /library/companies. No body.
// Returns the SyncSummary as JSON. Errors during individual company syncs
// are reported in summary.errors so the UI can surface partials; the route
// only 500s if the overall sync fails (e.g. missing tokens, Supabase down).

export async function POST(): Promise<Response> {
  try {
    const supabase = createServiceClient();
    const summary = await syncAllSignals(supabase);
    return NextResponse.json(summary);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
