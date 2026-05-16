import { afterEach, describe, expect, it, vi } from "vitest";
import { parseNodes, swapcardFactory } from "../lib/adapters/swapcard";
import type { EventMeta } from "../lib/adapters/types";

const META: EventMeta = {
  source: "swapcard",
  slug: "vitafoods-europe-2026",
  name: "Vitafoods Europe 2026",
  year: 2026,
  source_url:
    "https://visitor.vitafoodsglobal.com/event/vitafoods-europe-2026/exhibitors/RXZlbnRWaWV3XzEyNDIzNjc=",
};

const CONFIG = {
  viewId: "RXZlbnRWaWV3XzEyNDIzNjc=",
  eventId: "RXZlbnRfNDI4MjIxMQ==",
};

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("swapcard adapter — parseNodes()", () => {
  it("extracts raw_name and booth from withEvent", () => {
    const rows = parseNodes([
      { id: "1", name: "Acme", withEvent: { booth: "A12" } },
      { id: "2", name: "Beta", withEvent: { booth: "B07" } },
      { id: "3", name: "Online Co", withEvent: { booth: null } },
    ]);
    expect(rows).toEqual([
      { raw_name: "Acme", country: null, hall: null, booth: "A12" },
      { raw_name: "Beta", country: null, hall: null, booth: "B07" },
      { raw_name: "Online Co", country: null, hall: null, booth: null },
    ]);
  });

  it("skips empty/whitespace names", () => {
    const rows = parseNodes([
      { id: "1", name: "  ", withEvent: { booth: "A1" } },
      { id: "2", name: "", withEvent: null },
      { id: "3", name: "Real Co", withEvent: { booth: "C9" } },
    ]);
    expect(rows).toEqual([
      { raw_name: "Real Co", country: null, hall: null, booth: "C9" },
    ]);
  });

  it("deduplicates by lowercased name", () => {
    const rows = parseNodes([
      { id: "1", name: "Acme", withEvent: { booth: "A1" } },
      { id: "2", name: "ACME", withEvent: { booth: "A2" } },
      { id: "3", name: "acme", withEvent: { booth: "A3" } },
    ]);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.booth).toBe("A1");
  });

  it("treats null withEvent as no booth", () => {
    const rows = parseNodes([{ id: "1", name: "X", withEvent: null }]);
    expect(rows[0]?.booth).toBeNull();
  });
});

describe("swapcard adapter — fetch()", () => {
  function pageBody(opts: {
    nodes: Array<{ id: string; name: string; booth: string | null }>;
    hasNextPage: boolean;
    endCursor: string | null;
    totalCount?: number;
  }) {
    return [
      {
        data: {
          view: {
            id: "view",
            exhibitors: {
              nodes: opts.nodes.map((n) => ({
                id: n.id,
                name: n.name,
                withEvent: { booth: n.booth },
              })),
              pageInfo: {
                hasNextPage: opts.hasNextPage,
                endCursor: opts.endCursor,
              },
              totalCount: opts.totalCount ?? opts.nodes.length,
            },
          },
        },
      },
    ];
  }

  function bigNodes(n: number, prefix = "Co"): Array<{ id: string; name: string; booth: string | null }> {
    return Array.from({ length: n }, (_, i) => ({
      id: `id-${i}`,
      name: `${prefix} ${i}`,
      booth: `B${i}`,
    }));
  }

  it("paginates with endCursor until hasNextPage is false", async () => {
    const page1 = bigNodes(50, "P1");
    const page2 = bigNodes(50, "P2");
    const page3 = bigNodes(5, "P3");
    const fn = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: async () =>
          JSON.stringify(
            pageBody({ nodes: page1, hasNextPage: true, endCursor: "c1" }),
          ),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: async () =>
          JSON.stringify(
            pageBody({ nodes: page2, hasNextPage: true, endCursor: "c2" }),
          ),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: async () =>
          JSON.stringify(
            pageBody({ nodes: page3, hasNextPage: false, endCursor: null }),
          ),
      });
    vi.stubGlobal("fetch", fn);
    const adapter = swapcardFactory(META, CONFIG);
    const out = await adapter.fetch();
    expect(out).toHaveLength(105);
    expect(fn).toHaveBeenCalledTimes(3);
    // Variables on the second/third call include the prior endCursor.
    const callArgs = (
      fn.mock.calls as unknown as Array<[string, { body: string }]>
    ).map((c) => JSON.parse(c[1].body)[0].variables);
    expect(callArgs[0]).toEqual({
      withEvent: true,
      viewId: CONFIG.viewId,
      eventId: CONFIG.eventId,
    });
    expect(callArgs[1]?.endCursor).toBe("c1");
    expect(callArgs[2]?.endCursor).toBe("c2");
  });

  it("posts to api.swapcard.com/graphql with the persisted query hash", async () => {
    const fn = vi.fn(async () => ({
      ok: true,
      status: 200,
      text: async () =>
        JSON.stringify(
          pageBody({
            nodes: bigNodes(50),
            hasNextPage: false,
            endCursor: null,
          }),
        ),
    }));
    vi.stubGlobal("fetch", fn);
    const adapter = swapcardFactory(META, CONFIG);
    await adapter.fetch();
    const call = fn.mock.calls[0] as unknown as [string, { body: string }];
    expect(call[0]).toBe("https://api.swapcard.com/graphql");
    const body = JSON.parse(call[1].body);
    expect(body[0].operationName).toBe("EventExhibitorListViewConnectionQuery");
    expect(body[0].extensions.persistedQuery.sha256Hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it("honors a custom persistedQueryHash from config", async () => {
    const fn = vi.fn(async () => ({
      ok: true,
      status: 200,
      text: async () =>
        JSON.stringify(
          pageBody({
            nodes: bigNodes(50),
            hasNextPage: false,
            endCursor: null,
          }),
        ),
    }));
    vi.stubGlobal("fetch", fn);
    const adapter = swapcardFactory(META, {
      ...CONFIG,
      persistedQueryHash: "deadbeef".repeat(8),
    });
    await adapter.fetch();
    const call = fn.mock.calls[0] as unknown as [string, { body: string }];
    const body = JSON.parse(call[1].body);
    expect(body[0].extensions.persistedQuery.sha256Hash).toBe(
      "deadbeef".repeat(8),
    );
  });

  it("throws a clear message when the hash is rejected", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        status: 200,
        text: async () =>
          JSON.stringify([
            {
              errors: [
                {
                  message: "PersistedQueryNotFound",
                  extensions: { code: "PERSISTED_QUERY_NOT_FOUND" },
                },
              ],
            },
          ]),
      })),
    );
    const adapter = swapcardFactory(META, CONFIG);
    await expect(adapter.fetch()).rejects.toThrow(
      /persisted query hash rejected/,
    );
  });

  it("throws when the body looks like a bot-challenge HTML page", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        status: 200,
        text: async () =>
          "<!DOCTYPE html><html><head><title>Client Challenge</title>",
      })),
    );
    const adapter = swapcardFactory(META, CONFIG);
    await expect(adapter.fetch()).rejects.toThrow(/non-JSON body/);
  });

  it("throws when fewer than minExhibitors are returned", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        status: 200,
        text: async () =>
          JSON.stringify(
            pageBody({
              nodes: bigNodes(3),
              hasNextPage: false,
              endCursor: null,
            }),
          ),
      })),
    );
    const adapter = swapcardFactory(META, CONFIG);
    await expect(adapter.fetch()).rejects.toThrow(/min=50/);
  });

  it("dedupes across pages", async () => {
    const fn = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: async () =>
          JSON.stringify(
            pageBody({
              nodes: bigNodes(50, "Dup"),
              hasNextPage: true,
              endCursor: "c1",
            }),
          ),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: async () =>
          JSON.stringify(
            pageBody({
              // Same names again — should be filtered.
              nodes: bigNodes(50, "Dup"),
              hasNextPage: false,
              endCursor: null,
            }),
          ),
      });
    vi.stubGlobal("fetch", fn);
    const adapter = swapcardFactory(META, {
      ...CONFIG,
      minExhibitors: 1,
    });
    const out = await adapter.fetch();
    expect(out).toHaveLength(50);
  });
});

describe("swapcard adapter — config + meta", () => {
  it("rejects config missing viewId or eventId", () => {
    expect(() => swapcardFactory(META, {})).toThrow();
    expect(() => swapcardFactory(META, { viewId: "v" })).toThrow();
    expect(() => swapcardFactory(META, { eventId: "e" })).toThrow();
  });

  it("returns an Adapter whose meta is the input meta", () => {
    const adapter = swapcardFactory(META, CONFIG);
    expect(adapter.meta).toEqual(META);
  });
});
