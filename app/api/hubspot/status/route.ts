import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase";
import { readTokens } from "@/lib/hubspot/auth";

export const runtime = "nodejs";

// Phase 9: lightweight read used by /library/companies to render the
// "Connected as <email>" header and the last-sync timestamp. Never refreshes
// tokens (sync triggers refresh) so this stays cheap.

export async function GET(): Promise<Response> {
  try {
    const supabase = createServiceClient();
    const tokens = await readTokens(supabase);
    if (!tokens) {
      return NextResponse.json({ connected: false });
    }

    const { data: latest } = await supabase
      .from("company_hubspot_signals")
      .select("synced_at")
      .order("synced_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    return NextResponse.json({
      connected: true,
      portalId: tokens.portal_id,
      currentUserEmail: tokens.current_user_email,
      currentUserOwnerId: tokens.current_user_owner_id,
      lastSyncedAt: (latest as { synced_at?: string } | null)?.synced_at ?? null,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
