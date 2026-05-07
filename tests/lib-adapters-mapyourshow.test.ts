import { afterEach, describe, expect, it, vi } from "vitest";
import {
  mapyourshowFactory,
  parseMysHit,
  MapYourShowConfigSchema,
} from "../lib/adapters/mapyourshow";
import type { EventMeta } from "../lib/adapters/types";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const META: EventMeta = {
  source: "mapyourshow",
  slug: "tbse-2026",
  name: "The Battery Show Stuttgart 2026",
  year: 2026,
  source_url:
    "https://tbse26.mapyourshow.com/8_0/explore/exhibitor-gallery.cfm?featured=false",
};

describe("mapyourshow — parseMysHit", () => {
  it("strips the 'randomstring' suffix from booth", () => {
    const out = parseMysHit({
      fields: {
        exhname_t: "Acme",
        boothsdisplay_la: ["4-G82randomstring"],
        hallid_la: ["B"],
      },
    });
    expect(out).toEqual({
      raw_name: "Acme",
      country: null,
      hall: "B",
      booth: "4-G82",
    });
  });

  it("returns null when name is missing", () => {
    expect(parseMysHit({ fields: { exhname_t: "" } })).toBeNull();
    expect(parseMysHit({ fields: {} })).toBeNull();
  });

  it("handles missing booth/hall gracefully", () => {
    const out = parseMysHit({ fields: { exhname_t: "Just Name" } });
    expect(out).toEqual({
      raw_name: "Just Name",
      country: null,
      hall: null,
      booth: null,
    });
  });
});

describe("mapyourshow — MapYourShowConfigSchema", () => {
  it("requires domain", () => {
    expect(() => MapYourShowConfigSchema.parse({})).toThrow();
    expect(() => MapYourShowConfigSchema.parse({ domain: "" })).toThrow();
  });

  it("accepts optional minExhibitors >= 0", () => {
    expect(
      MapYourShowConfigSchema.parse({
        domain: "x.mapyourshow.com",
        minExhibitors: 0,
      }),
    ).toEqual({ domain: "x.mapyourshow.com", minExhibitors: 0 });
  });
});

describe("mapyourshow — mapyourshowFactory.fetch", () => {
  function stubChain(opts: {
    bootstrap?: { ok?: boolean; status?: number; setCookie?: string };
    api?: { ok?: boolean; status?: number; body?: unknown };
  }) {
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    const fn = vi.fn(async (url: string, init?: RequestInit) => {
      calls.push({ url, init });
      if (url.includes("/exhibitor-gallery.cfm")) {
        const setCookie = opts.bootstrap?.setCookie ?? "CFID=1; Path=/";
        return {
          ok: opts.bootstrap?.ok ?? true,
          status: opts.bootstrap?.status ?? 200,
          headers: {
            get: (k: string) =>
              k.toLowerCase() === "set-cookie" ? setCookie : null,
            getSetCookie: () => [setCookie],
          },
        };
      }
      return {
        ok: opts.api?.ok ?? true,
        status: opts.api?.status ?? 200,
        json: async () => opts.api?.body ?? { SUCCESS: true, DATA: { results: { exhibitor: { hit: [] } } } },
      };
    });
    vi.stubGlobal("fetch", fn);
    return { fn, calls };
  }

  function makeHits(n: number) {
    return Array.from({ length: n }, (_, i) => ({
      fields: {
        exhname_t: `Co ${i}`,
        boothsdisplay_la: [`H-${i}randomstring`],
        hallid_la: ["A"],
      },
    }));
  }

  it("bootstraps cookies, calls the search API, and parses hits", async () => {
    const { calls } = stubChain({
      api: {
        body: {
          SUCCESS: true,
          DATA: { totalhits: 60, results: { exhibitor: { hit: makeHits(60) } } },
        },
      },
    });
    const adapter = mapyourshowFactory(META, {
      domain: "tbse26.mapyourshow.com",
      minExhibitors: 50,
    });
    const out = await adapter.fetch();
    expect(out).toHaveLength(60);
    expect(out[0]).toMatchObject({ raw_name: "Co 0", booth: "H-0", hall: "A" });
    expect(calls[0]?.url).toContain("/exhibitor-gallery.cfm");
    expect(calls[1]?.url).toContain(
      "/8_0/ajax/remote-proxy.cfm?action=search&searchtype=exhibitorgallery",
    );
    const apiInit = calls[1]?.init as { headers: Record<string, string> };
    expect(apiInit.headers.Cookie).toContain("CFID=1");
    expect(apiInit.headers["X-Requested-With"]).toBe("XMLHttpRequest");
  });

  it("dedupes by lowercased name", async () => {
    stubChain({
      api: {
        body: {
          SUCCESS: true,
          DATA: {
            results: {
              exhibitor: {
                hit: [
                  { fields: { exhname_t: "Acme" } },
                  { fields: { exhname_t: "ACME" } },
                  { fields: { exhname_t: "Beta" } },
                ],
              },
            },
          },
        },
      },
    });
    const adapter = mapyourshowFactory(META, {
      domain: "tbse26.mapyourshow.com",
      minExhibitors: 0,
    });
    const out = await adapter.fetch();
    expect(out.map((r) => r.raw_name)).toEqual(["Acme", "Beta"]);
  });

  it("throws when bootstrap returns no cookies", async () => {
    stubChain({ bootstrap: { setCookie: "" } });
    const adapter = mapyourshowFactory(META, {
      domain: "tbse26.mapyourshow.com",
    });
    await expect(adapter.fetch()).rejects.toThrow(/no cookies/);
  });

  it("throws when API responds non-200", async () => {
    stubChain({ api: { ok: false, status: 503 } });
    const adapter = mapyourshowFactory(META, {
      domain: "tbse26.mapyourshow.com",
    });
    await expect(adapter.fetch()).rejects.toThrow(/fetch failed: 503/);
  });

  it("throws when SUCCESS=false", async () => {
    stubChain({
      api: { body: { SUCCESS: false, DATA: { results: { exhibitor: { hit: [] } } } } },
    });
    const adapter = mapyourshowFactory(META, {
      domain: "tbse26.mapyourshow.com",
    });
    await expect(adapter.fetch()).rejects.toThrow(/SUCCESS=false/);
  });

  it("throws when result count is below minExhibitors", async () => {
    stubChain({
      api: {
        body: {
          SUCCESS: true,
          DATA: { results: { exhibitor: { hit: makeHits(5) } } },
        },
      },
    });
    const adapter = mapyourshowFactory(META, {
      domain: "tbse26.mapyourshow.com",
      minExhibitors: 50,
    });
    await expect(adapter.fetch()).rejects.toThrow(/API shape may have changed/);
  });

  it("uses the configured domain for both bootstrap and API host", async () => {
    const { calls } = stubChain({
      api: {
        body: {
          SUCCESS: true,
          DATA: { results: { exhibitor: { hit: makeHits(60) } } },
        },
      },
    });
    const adapter = mapyourshowFactory(
      { ...META, source_url: "" },
      { domain: "ibc24.mapyourshow.com", minExhibitors: 0 },
    );
    await adapter.fetch();
    expect(calls[0]?.url).toContain("https://ibc24.mapyourshow.com/8_0/explore/");
    expect(calls[1]?.url).toContain("https://ibc24.mapyourshow.com/8_0/ajax/");
  });
});
