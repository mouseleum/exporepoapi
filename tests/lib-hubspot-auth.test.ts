import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  HUBSPOT_SCOPES,
  buildAuthorizeUrl,
  deriveRedirectUri,
  getValidAccessToken,
  lookupOwnerIdByEmail,
  type TokenRow,
} from "../lib/hubspot/auth";

// Phase 9: HubSpot OAuth helpers — pure-function tests and getValidAccessToken
// refresh path. Token-exchange + introspect networking is covered indirectly
// via the callback route at integration time; here we focus on logic.

function makeSupabase(initial: TokenRow | null) {
  let row = initial;
  const upserts: TokenRow[] = [];

  const tokensTable = {
    select: vi.fn(() => ({
      order: vi.fn(() => ({
        limit: vi.fn(() => ({
          maybeSingle: vi.fn(async () => ({ data: row, error: null })),
        })),
      })),
    })),
    upsert: vi.fn(async (next: Record<string, unknown>) => {
      const merged: TokenRow = {
        portal_id: next.portal_id as number,
        access_token: next.access_token as string,
        refresh_token: next.refresh_token as string,
        expires_at: next.expires_at as string,
        scope: next.scope as string,
        current_user_owner_id: (next.current_user_owner_id as string | null) ?? null,
        current_user_email: (next.current_user_email as string | null) ?? null,
      };
      upserts.push(merged);
      row = merged;
      return { error: null };
    }),
  };

  const supabase = {
    from: vi.fn((table: string) => {
      if (table === "hubspot_oauth_tokens") return tokensTable;
      throw new Error(`unexpected table: ${table}`);
    }),
  } as unknown as SupabaseClient;

  return { supabase, upserts, get row() { return row; } };
}

describe("buildAuthorizeUrl", () => {
  it("includes client_id, redirect_uri, scopes, state", () => {
    const url = buildAuthorizeUrl({
      clientId: "abc-123",
      redirectUri: "https://example.com/api/auth/hubspot/callback",
      state: "deadbeef",
    });
    const parsed = new URL(url);
    expect(parsed.origin + parsed.pathname).toBe("https://app.hubspot.com/oauth/authorize");
    expect(parsed.searchParams.get("client_id")).toBe("abc-123");
    expect(parsed.searchParams.get("redirect_uri")).toBe(
      "https://example.com/api/auth/hubspot/callback",
    );
    expect(parsed.searchParams.get("scope")).toBe(HUBSPOT_SCOPES);
    expect(parsed.searchParams.get("state")).toBe("deadbeef");
  });
});

describe("deriveRedirectUri", () => {
  const original = process.env.HUBSPOT_REDIRECT_URI;
  afterEach(() => {
    if (original === undefined) delete process.env.HUBSPOT_REDIRECT_URI;
    else process.env.HUBSPOT_REDIRECT_URI = original;
  });

  it("honors HUBSPOT_REDIRECT_URI override when set", () => {
    process.env.HUBSPOT_REDIRECT_URI = "https://override.example/cb";
    const req = new Request("https://something-else.example/api/auth/hubspot/connect");
    expect(deriveRedirectUri(req)).toBe("https://override.example/cb");
  });

  it("derives from request origin when override is not set", () => {
    delete process.env.HUBSPOT_REDIRECT_URI;
    const req = new Request("https://exporepoapi.vercel.app/api/auth/hubspot/connect");
    expect(deriveRedirectUri(req)).toBe(
      "https://exporepoapi.vercel.app/api/auth/hubspot/callback",
    );
  });
});

describe("getValidAccessToken", () => {
  const origClientId = process.env.HUBSPOT_CLIENT_ID;
  const origSecret = process.env.HUBSPOT_CLIENT_SECRET;

  beforeEach(() => {
    process.env.HUBSPOT_CLIENT_ID = "test-client";
    process.env.HUBSPOT_CLIENT_SECRET = "test-secret";
  });
  afterEach(() => {
    if (origClientId === undefined) delete process.env.HUBSPOT_CLIENT_ID;
    else process.env.HUBSPOT_CLIENT_ID = origClientId;
    if (origSecret === undefined) delete process.env.HUBSPOT_CLIENT_SECRET;
    else process.env.HUBSPOT_CLIENT_SECRET = origSecret;
    vi.restoreAllMocks();
  });

  it("returns null when no token row exists", async () => {
    const { supabase } = makeSupabase(null);
    expect(await getValidAccessToken(supabase)).toBeNull();
  });

  it("returns stored token when not near expiry (no refresh call)", async () => {
    const future = new Date(Date.now() + 5 * 60 * 1000).toISOString();
    const { supabase } = makeSupabase({
      portal_id: 123,
      access_token: "current",
      refresh_token: "r",
      expires_at: future,
      scope: HUBSPOT_SCOPES,
      current_user_owner_id: "owner-1",
      current_user_email: "me@example.com",
    });
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("should not be called", { status: 500 }),
    );

    const result = await getValidAccessToken(supabase);

    expect(fetchSpy).not.toHaveBeenCalled();
    expect(result).toEqual({
      accessToken: "current",
      portalId: 123,
      currentUserOwnerId: "owner-1",
      currentUserEmail: "me@example.com",
    });
  });

  it("refreshes and persists when token is past expiry", async () => {
    const past = new Date(Date.now() - 60_000).toISOString();
    const store = makeSupabase({
      portal_id: 123,
      access_token: "old",
      refresh_token: "r-old",
      expires_at: past,
      scope: HUBSPOT_SCOPES,
      current_user_owner_id: "owner-1",
      current_user_email: "me@example.com",
    });

    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          access_token: "new",
          refresh_token: "r-new",
          expires_in: 1800,
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
    );

    const result = await getValidAccessToken(store.supabase);
    expect(result?.accessToken).toBe("new");
    expect(store.upserts).toHaveLength(1);
    const persisted = store.upserts[0]!;
    expect(persisted.access_token).toBe("new");
    expect(persisted.refresh_token).toBe("r-new");
    expect(new Date(persisted.expires_at).getTime()).toBeGreaterThan(Date.now());
  });

  it("refreshes when within the skew window even though token hasn't expired", async () => {
    const inThirtySeconds = new Date(Date.now() + 30_000).toISOString();
    const store = makeSupabase({
      portal_id: 123,
      access_token: "near-expiry",
      refresh_token: "r",
      expires_at: inThirtySeconds,
      scope: HUBSPOT_SCOPES,
      current_user_owner_id: null,
      current_user_email: null,
    });

    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({ access_token: "fresh", refresh_token: "r2", expires_in: 1800 }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
    );

    const result = await getValidAccessToken(store.supabase);
    expect(result?.accessToken).toBe("fresh");
    expect(store.upserts).toHaveLength(1);
  });
});

describe("lookupOwnerIdByEmail", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns the owner id on a match", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({ results: [{ id: "owner-9", email: "me@example.com" }] }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
    );
    expect(await lookupOwnerIdByEmail("tok", "me@example.com")).toBe("owner-9");
  });

  it("returns null when the user is genuinely not an owner", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ results: [] }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );
    expect(await lookupOwnerIdByEmail("tok", "me@example.com")).toBeNull();
  });

  it("throws on HTTP errors instead of masking them as not-found", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("boom", { status: 503 }),
    );
    await expect(lookupOwnerIdByEmail("tok", "me@example.com")).rejects.toThrow(
      /owners lookup 503/,
    );
  });
});
