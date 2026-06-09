// Phase 9: HubSpot auth using a Private App bearer token from env. The
// integration originally shipped with OAuth (client_id/secret + tokens
// table); we switched to Private App on 2026-06-09 because creating a
// HubSpot Developer account is friction that doesn't buy anything for the
// single-portal use case.
//
// To upgrade to multi-portal later: bring back the OAuth scaffolding from
// commit 4820431 and add a portal-keyed tokens table — sync.ts only depends
// on getAccessToken() + getCurrentUserOwnerId(), which can be swapped.

const HUBSPOT_OWNERS_URL = "https://api.hubapi.com/crm/v3/owners/";

export function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`${name} is not set`);
  return v;
}

export type HubspotAuth = {
  accessToken: string;
  currentUserEmail: string | null;
  currentUserOwnerId: string | null;
};

// Resolve the token + the configured user's HubSpot owner id (used by the
// sync to tag engagements as met-by-me vs met-by-team). Returns null when
// the token isn't set so callers can render "Not configured" rather than
// 500. A configured HUBSPOT_OWNER_EMAIL that doesn't match an owner in the
// portal leaves currentUserOwnerId null and everything reads as met-by-team.
export async function loadHubspotAuth(): Promise<HubspotAuth | null> {
  const token = process.env.HUBSPOT_ACCESS_TOKEN;
  if (!token) return null;

  const email = process.env.HUBSPOT_OWNER_EMAIL ?? null;
  let ownerId: string | null = null;
  if (email) {
    ownerId = await lookupOwnerIdByEmail(token, email);
  }
  return { accessToken: token, currentUserEmail: email, currentUserOwnerId: ownerId };
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
  if (!res.ok) return null;
  const data = (await res.json()) as { results?: Array<{ id: string; email: string }> };
  return data.results?.[0]?.id ?? null;
}
