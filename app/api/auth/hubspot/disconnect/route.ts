import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase";
import { deleteTokens, readTokens } from "@/lib/hubspot/auth";

export const runtime = "nodejs";

// Phase 9: removes the stored HubSpot tokens. Does not call HubSpot's revoke
// endpoint — refresh tokens that go unused expire on HubSpot's side after 6
// months, which is fine for our purposes and avoids an extra failure mode if
// the network is flaky during disconnect.

export async function POST(): Promise<Response> {
  try {
    const supabase = createServiceClient();
    const tokens = await readTokens(supabase);
    if (tokens) {
      await deleteTokens(supabase, tokens.portal_id);
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
