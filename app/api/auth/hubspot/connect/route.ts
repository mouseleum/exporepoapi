import { NextResponse, type NextRequest } from "next/server";
import { randomBytes } from "node:crypto";
import { buildAuthorizeUrl, deriveRedirectUri, requireEnv } from "@/lib/hubspot/auth";

export const runtime = "nodejs";

// Phase 9: kicks off HubSpot OAuth. Generates a CSRF state, drops it in a
// short-lived HttpOnly cookie, and 302s the browser to HubSpot's consent
// screen. The callback route verifies the cookie before accepting `?code`.

const STATE_COOKIE = "hubspot_oauth_state";
const STATE_COOKIE_MAX_AGE_SECONDS = 600;

export async function GET(request: NextRequest) {
  let clientId: string;
  try {
    clientId = requireEnv("HUBSPOT_CLIENT_ID");
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }

  const state = randomBytes(32).toString("hex");
  const redirectUri = deriveRedirectUri(request);
  const authorizeUrl = buildAuthorizeUrl({ clientId, redirectUri, state });

  const response = NextResponse.redirect(authorizeUrl);
  response.cookies.set({
    name: STATE_COOKIE,
    value: state,
    httpOnly: true,
    secure: request.nextUrl.protocol === "https:",
    sameSite: "lax",
    path: "/",
    maxAge: STATE_COOKIE_MAX_AGE_SECONDS,
  });
  return response;
}
