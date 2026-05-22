import { afterEach, describe, expect, it, vi } from "vitest";
import {
  mapyourshowFactory,
  parseMysHit,
  parseCountryFromDetail,
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
  it("strips the 'randomstring' suffix from booth and keeps exhid as source_id", () => {
    const out = parseMysHit({
      fields: {
        exhname_t: "Acme",
        exhid_l: "942122",
        boothsdisplay_la: ["4-G82randomstring"],
        hallid_la: ["B"],
      },
    });
    expect(out).toEqual({
      raw_name: "Acme",
      country: null,
      hall: "B",
      booth: "4-G82",
      source_id: "942122",
    });
  });

  it("returns null when name is missing", () => {
    expect(parseMysHit({ fields: { exhname_t: "" } })).toBeNull();
    expect(parseMysHit({ fields: {} })).toBeNull();
  });

  it("handles missing booth/hall/exhid gracefully", () => {
    const out = parseMysHit({ fields: { exhname_t: "Just Name" } });
    expect(out).toEqual({
      raw_name: "Just Name",
      country: null,
      hall: null,
      booth: null,
      source_id: null,
    });
  });
});

describe("mapyourshow — parseCountryFromDetail", () => {
  const page = (addr: string) =>
    `<script>var x = Vue.component('c', { data(){ return {\n addressValues: ${addr},\n websiteValue: "https://x" }; } });</script>`;

  it("extracts COUNTRY from the addressValues literal", () => {
    expect(
      parseCountryFromDetail(
        page(
          '{"ZIP":"57399","CITY":"Kirchhundem","COUNTRY":"Germany","STATE":"","ADDRESS1":"Ohler Wiesen 15"}',
        ),
      ),
    ).toBe("Germany");
  });

  it("returns null when COUNTRY is empty", () => {
    expect(
      parseCountryFromDetail(page('{"ZIP":"1","CITY":"x","COUNTRY":""}')),
    ).toBeNull();
  });

  it("returns null when addressValues is absent", () => {
    expect(parseCountryFromDetail("<html>no data here</html>")).toBeNull();
  });

  it("returns null on malformed JSON rather than throwing", () => {
    expect(
      parseCountryFromDetail("addressValues: {not valid json at all}"),
    ).toBeNull();
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

  it("accepts optional includeCountry", () => {
    expect(
      MapYourShowConfigSchema.parse({
        domain: "x.mapyourshow.com",
        includeCountry: true,
      }),
    ).toEqual({ domain: "x.mapyourshow.com", includeCountry: true });
  });
});

describe("mapyourshow — mapyourshowFactory.fetch", () => {
  function stubChain(opts: {
    bootstrap?: { ok?: boolean; status?: number; setCookie?: string };
    api?: { ok?: boolean; status?: number; body?: unknown };
    detail?: (exhid: string) => { ok?: boolean; status?: number; html?: string };
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
      if (url.includes("/exhibitor-details.cfm")) {
        const exhid = new URL(url).searchParams.get("exhid") ?? "";
        const d = opts.detail?.(exhid) ?? { ok: true, html: "" };
        return {
          ok: d.ok ?? true,
          status: d.status ?? 200,
          text: async () => d.html ?? "",
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
        exhid_l: String(1000 + i),
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

  it("does NOT fetch detail pages when includeCountry is unset", async () => {
    const { calls } = stubChain({
      api: {
        body: {
          SUCCESS: true,
          DATA: { results: { exhibitor: { hit: makeHits(60) } } },
        },
      },
    });
    const adapter = mapyourshowFactory(META, {
      domain: "tbse26.mapyourshow.com",
      minExhibitors: 0,
    });
    const out = await adapter.fetch();
    expect(out.every((r) => r.country === null)).toBe(true);
    expect(calls.some((c) => c.url.includes("/exhibitor-details.cfm"))).toBe(
      false,
    );
  });

  it("fills country from detail pages when includeCountry is true", async () => {
    const countries: Record<string, string> = {
      "1000": "Germany",
      "1001": "Italy",
      "1002": "Croatia",
    };
    const { calls } = stubChain({
      api: {
        body: {
          SUCCESS: true,
          DATA: { results: { exhibitor: { hit: makeHits(3) } } },
        },
      },
      detail: (exhid) => ({
        ok: true,
        html: `addressValues: {"CITY":"x","COUNTRY":"${countries[exhid] ?? ""}"}`,
      }),
    });
    const adapter = mapyourshowFactory(META, {
      domain: "tbse26.mapyourshow.com",
      minExhibitors: 0,
      includeCountry: true,
    });
    const out = await adapter.fetch();
    expect(out.map((r) => r.country)).toEqual([
      "Germany",
      "Italy",
      "Croatia",
    ]);
    const detailCalls = calls.filter((c) =>
      c.url.includes("/exhibitor-details.cfm"),
    );
    expect(detailCalls).toHaveLength(3);
    expect(detailCalls[0]?.init?.headers).toMatchObject({ Cookie: "CFID=1" });
  });

  it("leaves country null when a detail page fails or lacks address", async () => {
    const { calls } = stubChain({
      api: {
        body: {
          SUCCESS: true,
          DATA: { results: { exhibitor: { hit: makeHits(3) } } },
        },
      },
      detail: (exhid) =>
        exhid === "1001"
          ? { ok: false, status: 500 }
          : { ok: true, html: "<html>no address block</html>" },
    });
    const adapter = mapyourshowFactory(META, {
      domain: "tbse26.mapyourshow.com",
      minExhibitors: 0,
      includeCountry: true,
    });
    const out = await adapter.fetch();
    expect(out.every((r) => r.country === null)).toBe(true);
    expect(
      calls.filter((c) => c.url.includes("/exhibitor-details.cfm")),
    ).toHaveLength(3);
  });
});
