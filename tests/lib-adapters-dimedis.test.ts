import { afterEach, describe, expect, it, vi } from "vitest";
import {
  dimedisFactory,
  parseLetter,
  parseLocation,
  type DirectoryEntry,
  type DirectoryMeta,
} from "../lib/adapters/dimedis";
import type { EventMeta } from "../lib/adapters/types";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const META: EventMeta = {
  source: "dimedis",
  slug: "example-2027",
  name: "Example 2027",
  year: 2027,
  source_url: "https://www.example.de/vis/v1/en/directory/a",
};

describe("dimedis — parseLocation", () => {
  it("splits 'Hall 8a / C12'", () => {
    expect(parseLocation("Hall 8a / C12")).toEqual({
      hall: "8a",
      booth: "C12",
    });
  });

  it("returns null/null for empty input", () => {
    expect(parseLocation("")).toEqual({ hall: null, booth: null });
    expect(parseLocation(null)).toEqual({ hall: null, booth: null });
  });

  it("falls back to hall=raw on no match", () => {
    expect(parseLocation("TBD")).toEqual({ hall: "TBD", booth: null });
  });
});

describe("dimedis — parseLetter", () => {
  it("emits one row per profile entry, drops non-profile rows", () => {
    const entries: DirectoryEntry[] = [
      { id: "1", type: "profile", name: "A Co", country: "DE", location: "Hall 1 / B2" },
      { id: "2", type: "trademark", name: "T-Mark" },
      { id: "3", type: "profile", name: "B Co" },
    ];
    expect(parseLetter(entries).map((r) => r.raw_name)).toEqual(["A Co", "B Co"]);
  });
});

describe("dimedis — dimedisFactory", () => {
  function stubFetch(handler: (url: string) => unknown) {
    const fn = vi.fn(async (_url: string, _init?: RequestInit) => ({
      ok: true,
      status: 200,
      json: async () => handler(_url),
    }));
    vi.stubGlobal("fetch", fn);
    return fn;
  }

  const dirMeta: DirectoryMeta = {
    links: [
      { link: "a", label: "A", isFilled: true },
      { link: "b", label: "B", isFilled: true },
      { link: "z", label: "Z", isFilled: false },
    ],
  };

  it("uses the configured domain in the X-Vis-Domain header and URL host", async () => {
    const fn = stubFetch((url) => {
      if (url.endsWith("/directory/meta")) return dirMeta;
      return Array.from({ length: 30 }, (_, i) => ({
        id: `p${i}`,
        type: "profile",
        name: `${url.slice(-1)}-Co-${i}`,
        country: "DE",
      }));
    });

    const adapter = dimedisFactory(META, {
      domain: "www.example.de",
      minExhibitors: 10,
    });
    const out = await adapter.fetch();
    expect(out.length).toBe(60);

    const calledUrls = fn.mock.calls.map((c) => c[0]);
    expect(calledUrls[0]).toBe(
      "https://www.example.de/vis-api/vis/v1/en/directory/meta",
    );
    for (const c of fn.mock.calls) {
      const init = c[1] as { headers: Record<string, string> };
      expect(init.headers["X-Vis-Domain"]).toBe("www.example.de");
    }
  });

  it("skips letters with isFilled=false", async () => {
    const fn = stubFetch((url) => {
      if (url.endsWith("/directory/meta")) return dirMeta;
      return [
        { id: "p", type: "profile", name: `${url.slice(-1)}-Co`, country: "" },
      ];
    });
    const adapter = dimedisFactory(META, {
      domain: "www.example.de",
      minExhibitors: 1,
    });
    await adapter.fetch();
    const calledUrls = fn.mock.calls.map((c) => c[0]);
    expect(calledUrls.some((u) => u.endsWith("/directory/z"))).toBe(false);
  });

  it("respects the configured language", async () => {
    const fn = stubFetch(() => dirMeta);
    const adapter = dimedisFactory(META, {
      domain: "www.example.de",
      lang: "de",
      minExhibitors: 0,
    });
    await expect(adapter.fetch()).rejects.toThrow();
    const firstUrl = fn.mock.calls[0]?.[0];
    expect(firstUrl).toContain("/vis-api/vis/v1/de/");
  });

  it("throws when result count is below minExhibitors", async () => {
    stubFetch((url) => {
      if (url.endsWith("/directory/meta")) return dirMeta;
      return [{ id: "p", type: "profile", name: `${url.slice(-1)}-Co` }];
    });
    const adapter = dimedisFactory(META, {
      domain: "www.example.de",
      minExhibitors: 100,
    });
    await expect(adapter.fetch()).rejects.toThrow(/API shape may have changed/);
  });

  it("dedupes by lowercased name across letters", async () => {
    stubFetch((url) => {
      if (url.endsWith("/directory/meta")) return dirMeta;
      return [{ id: "p", type: "profile", name: "Same Co", country: "DE" }];
    });
    const adapter = dimedisFactory(META, {
      domain: "www.example.de",
      minExhibitors: 1,
    });
    const out = await adapter.fetch();
    expect(out.map((r) => r.raw_name)).toEqual(["Same Co"]);
  });

  it("error messages include the source name from meta", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: false, status: 503, json: async () => ({}) })),
    );
    const adapter = dimedisFactory(
      { ...META, source: "myshow" },
      { domain: "www.example.de" },
    );
    await expect(adapter.fetch()).rejects.toThrow(/myshow fetch .* failed: 503/);
  });

  it("rejects an invalid config blob via Zod", () => {
    expect(() => dimedisFactory(META, { lang: "en" })).toThrow();
    expect(() => dimedisFactory(META, { domain: "" })).toThrow();
  });
});
