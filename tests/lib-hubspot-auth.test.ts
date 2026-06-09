import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { loadHubspotAuth, lookupOwnerIdByEmail } from "../lib/hubspot/auth";

// Phase 9: HubSpot Private App auth helpers. The token comes from env; the
// owner_id is resolved (when an email is configured) via a single GET to
// /crm/v3/owners. No persistent state — auth is configuration.

describe("loadHubspotAuth", () => {
  const origToken = process.env.HUBSPOT_ACCESS_TOKEN;
  const origEmail = process.env.HUBSPOT_OWNER_EMAIL;

  beforeEach(() => {
    delete process.env.HUBSPOT_ACCESS_TOKEN;
    delete process.env.HUBSPOT_OWNER_EMAIL;
  });
  afterEach(() => {
    if (origToken === undefined) delete process.env.HUBSPOT_ACCESS_TOKEN;
    else process.env.HUBSPOT_ACCESS_TOKEN = origToken;
    if (origEmail === undefined) delete process.env.HUBSPOT_OWNER_EMAIL;
    else process.env.HUBSPOT_OWNER_EMAIL = origEmail;
    vi.restoreAllMocks();
  });

  it("returns null when HUBSPOT_ACCESS_TOKEN is missing", async () => {
    expect(await loadHubspotAuth()).toBeNull();
  });

  it("returns token-only auth when no owner email is set", async () => {
    process.env.HUBSPOT_ACCESS_TOKEN = "pat-1234";
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const auth = await loadHubspotAuth();
    expect(auth).toEqual({
      accessToken: "pat-1234",
      currentUserEmail: null,
      currentUserOwnerId: null,
    });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("resolves owner_id when HUBSPOT_OWNER_EMAIL is set", async () => {
    process.env.HUBSPOT_ACCESS_TOKEN = "pat-1234";
    process.env.HUBSPOT_OWNER_EMAIL = "me@example.com";
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ results: [{ id: "owner-42", email: "me@example.com" }] }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );
    const auth = await loadHubspotAuth();
    expect(auth).toEqual({
      accessToken: "pat-1234",
      currentUserEmail: "me@example.com",
      currentUserOwnerId: "owner-42",
    });
  });

  it("leaves owner_id null when the email doesn't resolve to an owner", async () => {
    process.env.HUBSPOT_ACCESS_TOKEN = "pat-1234";
    process.env.HUBSPOT_OWNER_EMAIL = "ghost@example.com";
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ results: [] }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );
    const auth = await loadHubspotAuth();
    expect(auth?.currentUserOwnerId).toBeNull();
    expect(auth?.currentUserEmail).toBe("ghost@example.com");
  });
});

describe("lookupOwnerIdByEmail", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns null on non-OK response rather than throwing", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("nope", { status: 401 }));
    expect(await lookupOwnerIdByEmail("pat", "me@example.com")).toBeNull();
  });

  it("URL-encodes the email parameter", async () => {
    let captured = "";
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      captured = typeof input === "string" ? input : (input as URL).toString();
      return new Response(JSON.stringify({ results: [] }), { status: 200 });
    });
    await lookupOwnerIdByEmail("pat", "first+filter@example.com");
    expect(captured).toContain("email=first%2Bfilter%40example.com");
  });
});
