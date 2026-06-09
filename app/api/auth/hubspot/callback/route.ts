import { NextResponse, type NextRequest } from "next/server";
import { createServiceClient } from "@/lib/supabase";
import {
  HUBSPOT_SCOPES,
  deriveRedirectUri,
  exchangeCode,
  introspectAccessToken,
  lookupOwnerIdByEmail,
  requireEnv,
  upsertTokens,
} from "@/lib/hubspot/auth";

export const runtime = "nodejs";

const STATE_COOKIE = "hubspot_oauth_state";

// Phase 9: completes HubSpot OAuth. Verifies the state cookie set by
// /api/auth/hubspot/connect, exchanges the code for tokens, introspects the
// access token for hub_id + user email, resolves the user's HubSpot owner_id
// (so the sync can later tag engagements as met-by-me vs met-by-team), and
// stores everything in hubspot_oauth_tokens.

function errorRedirect(request: NextRequest, code: string): NextResponse {
  const u = new URL("/library/companies", request.url);
  u.searchParams.set("hubspot", "error");
  u.searchParams.set("reason", code);
  const response = NextResponse.redirect(u);
  response.cookies.delete(STATE_COOKIE);
  return response;
}

export async function GET(request: NextRequest) {
  const stateFromUrl = request.nextUrl.searchParams.get("state");
  const code = request.nextUrl.searchParams.get("code");
  const stateCookie = request.cookies.get(STATE_COOKIE)?.value;

  if (!stateFromUrl || !stateCookie || stateFromUrl !== stateCookie) {
    return errorRedirect(request, "state_mismatch");
  }
  if (!code) {
    return errorRedirect(request, "missing_code");
  }

  let clientId: string;
  let clientSecret: string;
  try {
    clientId = requireEnv("HUBSPOT_CLIENT_ID");
    clientSecret = requireEnv("HUBSPOT_CLIENT_SECRET");
  } catch {
    return errorRedirect(request, "missing_env");
  }

  const redirectUri = deriveRedirectUri(request);

  try {
    const tokens = await exchangeCode({ code, clientId, clientSecret, redirectUri });
    const meta = await introspectAccessToken(tokens.access_token);
    const ownerId = await lookupOwnerIdByEmail(tokens.access_token, meta.user);

    const supabase = createServiceClient();
    await upsertTokens(supabase, {
      portal_id: meta.hub_id,
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token,
      expires_at: new Date(Date.now() + tokens.expires_in * 1000).toISOString(),
      scope: HUBSPOT_SCOPES,
      current_user_owner_id: ownerId,
      current_user_email: meta.user,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("hubspot callback failed:", message);
    return errorRedirect(request, "exchange_failed");
  }

  const success = new URL("/library/companies", request.url);
  success.searchParams.set("hubspot", "connected");
  const response = NextResponse.redirect(success);
  response.cookies.delete(STATE_COOKIE);
  return response;
}
