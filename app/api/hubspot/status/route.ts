import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase";

export const runtime = "nodejs";

// Phase 9: lightweight read used by /library/companies to render the
// header strip. Returns whether the Private App token is configured and the
// last-synced timestamp from company_hubspot_signals.

export async function GET(): Promise<Response> {
  const token = process.env.HUBSPOT_ACCESS_TOKEN;
  const email = process.env.HUBSPOT_OWNER_EMAIL ?? null;

  if (!token) {
    return NextResponse.json({ connected: false });
  }

  try {
    const supabase = createServiceClient();
    const { data: latest, error } = await supabase
      .from("company_hubspot_signals")
      .select("synced_at")
      .order("synced_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) {
      const msg = error.message.toLowerCase();
      // Migration 0009 not applied yet — surface that to the UI so it can
      // show a "run the migration" hint instead of pretending sync works.
      if (msg.includes("does not exist") || msg.includes("schema cache")) {
        return NextResponse.json({
          connected: true,
          currentUserEmail: email,
          lastSyncedAt: null,
          migrationPending: true,
        });
      }
      throw new Error(error.message);
    }
    return NextResponse.json({
      connected: true,
      currentUserEmail: email,
      lastSyncedAt: (latest as { synced_at?: string } | null)?.synced_at ?? null,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
