import { afterEach, describe, expect, it, vi } from "vitest";
import {
  batchReadDeals,
  batchReadEngagements,
  formatOwnerName,
  listAssociations,
  listDealStages,
  listOwners,
  searchCompaniesByDomain,
} from "../lib/hubspot/client";

// Phase 9: client surface — happy-path fetch shape per method. Network is
// mocked; the goal is to lock down request URL/body shape and response
// parsing, not to re-test fetch semantics.

afterEach(() => {
  vi.restoreAllMocks();
});

function mockFetch(handler: (url: string, init: RequestInit) => Response | Promise<Response>) {
  return vi.spyOn(globalThis, "fetch").mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : (input as URL).toString();
    return handler(url, init ?? {});
  });
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

describe("searchCompaniesByDomain", () => {
  it("POSTs filter with IN operator and parses results", async () => {
    let captured: { url: string; body: Record<string, unknown> } | null = null;
    mockFetch((url, init) => {
      captured = { url, body: JSON.parse(init.body as string) };
      return jsonResponse({
        results: [
          { id: "111", properties: { domain: "acme.com", name: "Acme Inc" } },
          { id: "222", properties: { domain: "beta.com", name: "Beta Co" } },
        ],
      });
    });
    const out = await searchCompaniesByDomain("tok", ["Acme.com", "beta.com"]);
    expect(captured).not.toBeNull();
    const c = captured!;
    expect(c.url).toBe("https://api.hubapi.com/crm/v3/objects/companies/search");
    const groups = c.body.filterGroups as Array<{
      filters: Array<{ values: string[]; operator: string }>;
    }>;
    const filter = groups[0]!.filters[0]!;
    expect(filter.operator).toBe("IN");
    expect(filter.values).toEqual(["acme.com", "beta.com"]);
    expect(out).toEqual([
      { id: "111", domain: "acme.com", name: "Acme Inc" },
      { id: "222", domain: "beta.com", name: "Beta Co" },
    ]);
  });

  it("paginates via paging.next.after", async () => {
    const pages = [
      { results: [{ id: "1", properties: { domain: "a.com", name: "A" } }], paging: { next: { after: "p2" } } },
      { results: [{ id: "2", properties: { domain: "b.com", name: "B" } }] },
    ];
    let call = 0;
    mockFetch(() => jsonResponse(pages[call++]!));
    const out = await searchCompaniesByDomain("tok", ["a.com", "b.com"]);
    expect(out.map((c) => c.id)).toEqual(["1", "2"]);
    expect(call).toBe(2);
  });

  it("returns [] for empty input without calling fetch", async () => {
    const spy = mockFetch(() => jsonResponse({}));
    expect(await searchCompaniesByDomain("tok", [])).toEqual([]);
    expect(spy).not.toHaveBeenCalled();
  });
});

describe("listAssociations", () => {
  it("parses toObjectId from v4 association results", async () => {
    mockFetch(() =>
      jsonResponse({
        results: [
          { toObjectId: 99, associationTypes: [] },
          { toObjectId: 100 },
        ],
      }),
    );
    const ids = await listAssociations("tok", "companies", "5", "contacts");
    expect(ids).toEqual(["99", "100"]);
  });

  it("returns [] on 404", async () => {
    mockFetch(() => new Response("not found", { status: 404 }));
    expect(await listAssociations("tok", "companies", "5", "deals")).toEqual([]);
  });
});

describe("batchReadEngagements", () => {
  it("requests meeting timestamp prop for meetings", async () => {
    let captured: Record<string, unknown> | null = null;
    mockFetch((_url, init) => {
      captured = JSON.parse(init.body as string);
      return jsonResponse({
        results: [
          {
            id: "m1",
            properties: { hs_meeting_start_time: "2026-05-01T10:00:00Z", hubspot_owner_id: "11" },
          },
        ],
      });
    });
    const out = await batchReadEngagements("tok", "meetings", ["m1"]);
    expect((captured!.properties as string[])).toContain("hs_meeting_start_time");
    expect(out[0]).toEqual({
      id: "m1",
      type: "meetings",
      ownerId: "11",
      timestamp: "2026-05-01T10:00:00Z",
    });
  });

  it("uses hs_timestamp for calls", async () => {
    let captured: Record<string, unknown> | null = null;
    mockFetch((_url, init) => {
      captured = JSON.parse(init.body as string);
      return jsonResponse({
        results: [{ id: "c1", properties: { hs_timestamp: "2026-04-01T10:00:00Z", hubspot_owner_id: null } }],
      });
    });
    const out = await batchReadEngagements("tok", "calls", ["c1"]);
    expect((captured!.properties as string[])).toContain("hs_timestamp");
    expect(out[0]?.ownerId).toBeNull();
  });
});

describe("batchReadDeals", () => {
  it("parses amount as number and pipeline + dealstage as string", async () => {
    mockFetch(() =>
      jsonResponse({
        results: [
          { id: "d1", properties: { dealstage: "1234", amount: "50000", pipeline: "default" } },
          { id: "d2", properties: { dealstage: "closedwon", amount: "", pipeline: "default" } },
        ],
      }),
    );
    const out = await batchReadDeals("tok", ["d1", "d2"]);
    expect(out).toEqual([
      { id: "d1", dealstage: "1234", amount: 50000, pipeline: "default" },
      { id: "d2", dealstage: "closedwon", amount: null, pipeline: "default" },
    ]);
  });
});

describe("listDealStages", () => {
  it("flattens pipelines into a stage list with closed flag", async () => {
    mockFetch(() =>
      jsonResponse({
        results: [
          {
            id: "default",
            stages: [
              { id: "1", label: "Discovery", metadata: { isClosed: "false" } },
              { id: "2", label: "Closed Won", metadata: { isClosed: "true" } },
            ],
          },
        ],
      }),
    );
    const stages = await listDealStages("tok");
    expect(stages).toEqual([
      { id: "1", label: "Discovery", pipelineId: "default", closed: false },
      { id: "2", label: "Closed Won", pipelineId: "default", closed: true },
    ]);
  });
});

describe("listOwners + formatOwnerName", () => {
  it("paginates and formats names", async () => {
    const pages = [
      {
        results: [
          { id: "11", email: "me@example.com", firstName: "Mika", lastName: "Rinne" },
        ],
        paging: { next: { after: "p2" } },
      },
      {
        results: [
          { id: "22", email: "no-name@example.com", firstName: null, lastName: null },
        ],
      },
    ];
    let call = 0;
    mockFetch(() => jsonResponse(pages[call++]!));
    const owners = await listOwners("tok");
    expect(owners).toHaveLength(2);
    expect(formatOwnerName(owners[0])).toBe("Mika Rinne");
    expect(formatOwnerName(owners[1])).toBe("no-name@example.com");
    expect(formatOwnerName(undefined)).toBeNull();
  });
});

describe("retry behavior", () => {
  it("retries 429 once and succeeds", async () => {
    let call = 0;
    mockFetch(() => {
      call++;
      if (call === 1) {
        return new Response("rate", {
          status: 429,
          headers: { "retry-after": "0" },
        });
      }
      return jsonResponse({ results: [] });
    });
    const out = await searchCompaniesByDomain("tok", ["x.com"]);
    expect(out).toEqual([]);
    expect(call).toBe(2);
  }, 10_000);
});
