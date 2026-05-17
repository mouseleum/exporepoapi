import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

// Gates the admin UI + the two upstream-API proxies behind HTTP Basic Auth.
// Without this, /api/score and /api/enrich are publicly callable and would let
// anyone burn the project's Anthropic / PDL credits via curl. /library/admin
// is also gated because its server actions use the service-role Supabase
// client (RLS bypassed) — open admin = open writes.
//
// /api/cron/* is intentionally NOT in the matcher: it has its own CRON_SECRET
// Bearer check and is hit by Vercel's cron scheduler, not a logged-in user.

const REALM = "Library Admin";

function unauthorized(): NextResponse {
  return new NextResponse("Authentication required.", {
    status: 401,
    headers: { "WWW-Authenticate": `Basic realm="${REALM}"` },
  });
}

export function middleware(req: NextRequest) {
  const password = process.env.ADMIN_PASSWORD;
  if (!password) return unauthorized();

  const expectedUser = process.env.ADMIN_USERNAME ?? "admin";
  const header = req.headers.get("authorization");
  if (!header || !header.startsWith("Basic ")) return unauthorized();

  const decoded = atob(header.slice("Basic ".length).trim());
  const sep = decoded.indexOf(":");
  if (sep === -1) return unauthorized();
  const user = decoded.slice(0, sep);
  const pass = decoded.slice(sep + 1);
  if (user !== expectedUser || pass !== password) return unauthorized();

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/library/admin",
    "/library/admin/:path*",
    "/api/score",
    "/api/score/:path*",
    "/api/enrich",
    "/api/enrich/:path*",
  ],
};
