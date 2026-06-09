import type { SupabaseClient } from "@supabase/supabase-js";

// Phase 9: HubSpot OAuth helpers — install/refresh/introspect + token storage.
// Designed for a single connected portal today, but the storage table is keyed
// by portal_id so multi-portal expansion is non-breaking.

const HUBSPOT_AUTHORIZE_URL = "https://app.hubspot.com/oauth/authorize";
const HUBSPOT_TOKEN_URL = "https://api.hubapi.com/oauth/v1/token";
const HUBSPOT_INTROSPECT_URL = "https://api.hubapi.com/oauth/v1/access-tokens";
const HUBSPOT_OWNERS_URL = "https://api.hubapi.com/crm/v3/owners/";

// Refresh ~60s before HubSpot's stated expiry to avoid mid-request 401s when
// the access token is on the edge of validity.
const REFRESH_SKEW_SECONDS = 60;

export const HUBSPOT_SCOPES = [
  "oauth",
  "crm.objects.companies.read",
  "crm.objects.contacts.read",
  "crm.objects.deals.read",
  "crm.objects.owners.read",
  "crm.schemas.deals.read",
  "sales-email-read",
].join(" ");

export type TokenRow = {
  portal_id: number;
  access_token: string;
  refresh_token: string;
  expires_at: string;
  scope: string;
  current_user_owner_id: string | null;
  current_user_email: string | null;
};

export type ExchangeResult = {
  access_token: string;
  refresh_token: string;
  expires_in: number;
};

export function buildAuthorizeUrl(args: {
  clientId: string;
  redirectUri: string;
  state: string;
}): string {
  const u = new URL(HUBSPOT_AUTHORIZE_URL);
  u.searchParams.set("client_id", args.clientId);
  u.searchParams.set("redirect_uri", args.redirectUri);
  u.searchParams.set("scope", HUBSPOT_SCOPES);
  u.searchParams.set("state", args.state);
  return u.toString();
}

export async function exchangeCode(args: {
  code: string;
  clientId: string;
  clientSecret: string;
  redirectUri: string;
}): Promise<ExchangeResult> {
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    client_id: args.clientId,
    client_secret: args.clientSecret,
    redirect_uri: args.redirectUri,
    code: args.code,
  });
  const res = await fetch(HUBSPOT_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`HubSpot exchangeCode ${res.status}: ${text.slice(0, 300)}`);
  }
  return (await res.json()) as ExchangeResult;
}

export async function refreshAccessToken(args: {
  refreshToken: string;
  clientId: string;
  clientSecret: string;
}): Promise<ExchangeResult> {
  const body = new URLSearchParams({
    grant_type: "refresh_token",
    client_id: args.clientId,
    client_secret: args.clientSecret,
    refresh_token: args.refreshToken,
  });
  const res = await fetch(HUBSPOT_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`HubSpot refreshAccessToken ${res.status}: ${text.slice(0, 300)}`);
  }
  return (await res.json()) as ExchangeResult;
}

export type AccessTokenMeta = {
  user: string;
  user_id: number;
  hub_id: number;
  hub_domain?: string;
  scopes?: string[];
  scope_to_scope_group_pks?: number[];
};

export async function introspectAccessToken(token: string): Promise<AccessTokenMeta> {
  const res = await fetch(`${HUBSPOT_INTROSPECT_URL}/${encodeURIComponent(token)}`);
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`HubSpot introspect ${res.status}: ${text.slice(0, 300)}`);
  }
  return (await res.json()) as AccessTokenMeta;
}

export async function lookupOwnerIdByEmail(
  accessToken: string,
  email: string,
): Promise<string | null> {
  const u = new URL(HUBSPOT_OWNERS_URL);
  u.searchParams.set("email", email);
  const res = await fetch(u.toString(), {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) {
    // Null is reserved for "user is genuinely not an owner" — an HTTP failure
    // here must abort the OAuth callback, otherwise a null owner_id gets
    // stored and every engagement is silently tagged met-by-team forever.
    const text = await res.text();
    throw new Error(`HubSpot owners lookup ${res.status}: ${text.slice(0, 300)}`);
  }
  const data = (await res.json()) as { results?: Array<{ id: string; email: string }> };
  return data.results?.[0]?.id ?? null;
}

// ---- Storage ----

export async function readTokens(
  supabase: SupabaseClient,
): Promise<TokenRow | null> {
  const { data, error } = await supabase
    .from("hubspot_oauth_tokens")
    .select(
      "portal_id, access_token, refresh_token, expires_at, scope, current_user_owner_id, current_user_email",
    )
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(`readTokens: ${error.message}`);
  return (data as TokenRow | null) ?? null;
}

export async function upsertTokens(
  supabase: SupabaseClient,
  row: TokenRow,
): Promise<void> {
  const { error } = await supabase
    .from("hubspot_oauth_tokens")
    .upsert(
      {
        portal_id: row.portal_id,
        access_token: row.access_token,
        refresh_token: row.refresh_token,
        expires_at: row.expires_at,
        scope: row.scope,
        current_user_owner_id: row.current_user_owner_id,
        current_user_email: row.current_user_email,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "portal_id" },
    );
  if (error) throw new Error(`upsertTokens: ${error.message}`);
}

export async function deleteTokens(
  supabase: SupabaseClient,
  portalId: number,
): Promise<void> {
  const { error } = await supabase
    .from("hubspot_oauth_tokens")
    .delete()
    .eq("portal_id", portalId);
  if (error) throw new Error(`deleteTokens: ${error.message}`);
}

// Returns a valid access token, refreshing first if the stored one is within
// REFRESH_SKEW_SECONDS of expiry. Persists the refreshed values back to the
// table. Returns null when no token row exists (caller should treat as "not
// connected"). Other errors throw.
export async function getValidAccessToken(
  supabase: SupabaseClient,
): Promise<{
  accessToken: string;
  portalId: number;
  currentUserOwnerId: string | null;
  currentUserEmail: string | null;
} | null> {
  const tokens = await readTokens(supabase);
  if (!tokens) return null;

  const expiresAtMs = new Date(tokens.expires_at).getTime();
  const skewMs = REFRESH_SKEW_SECONDS * 1000;
  if (Number.isFinite(expiresAtMs) && expiresAtMs - Date.now() > skewMs) {
    return {
      accessToken: tokens.access_token,
      portalId: tokens.portal_id,
      currentUserOwnerId: tokens.current_user_owner_id,
      currentUserEmail: tokens.current_user_email,
    };
  }

  const clientId = requireEnv("HUBSPOT_CLIENT_ID");
  const clientSecret = requireEnv("HUBSPOT_CLIENT_SECRET");

  const refreshed = await refreshAccessToken({
    refreshToken: tokens.refresh_token,
    clientId,
    clientSecret,
  });
  const newExpiresAt = new Date(Date.now() + refreshed.expires_in * 1000).toISOString();
  const next: TokenRow = {
    ...tokens,
    access_token: refreshed.access_token,
    refresh_token: refreshed.refresh_token,
    expires_at: newExpiresAt,
  };
  await upsertTokens(supabase, next);

  return {
    accessToken: next.access_token,
    portalId: next.portal_id,
    currentUserOwnerId: next.current_user_owner_id,
    currentUserEmail: next.current_user_email,
  };
}

export function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`${name} is not set`);
  return v;
}

// Build the redirect_uri that the OAuth flow must use. Honors an explicit
// HUBSPOT_REDIRECT_URI override (useful when the request origin doesn't
// match the registered URI — e.g. behind a proxy); otherwise derives from
// the request origin.
export function deriveRedirectUri(request: Request): string {
  const override = process.env.HUBSPOT_REDIRECT_URI;
  if (override) return override;
  const u = new URL(request.url);
  return `${u.origin}/api/auth/hubspot/callback`;
}
