import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  interpackAdapter,
  parseLetter,
  parseLocation,
  type DirectoryEntry,
  type DirectoryMeta,
} from "../lib/adapters/interpack";

const letterA = JSON.parse(
  readFileSync(join(__dirname, "fixtures/interpack-letter-a.json"), "utf8"),
) as DirectoryEntry[];

const dirMeta = JSON.parse(
  readFileSync(join(__dirname, "fixtures/interpack-meta.json"), "utf8"),
) as DirectoryMeta;

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("interpack adapter — parseLocation()", () => {
  it("splits 'Hall 15 / D42' into hall=15 booth=D42", () => {
    expect(parseLocation("Hall 15 / D42")).toEqual({
      hall: "15",
      booth: "D42",
    });
  });

  it("preserves alphanumeric hall numbers like '8a'", () => {
    expect(parseLocation("Hall 8a / C12")).toEqual({
      hall: "8a",
      booth: "C12",
    });
  });

  it("returns null/null for empty or whitespace input", () => {
    expect(parseLocation("")).toEqual({ hall: null, booth: null });
    expect(parseLocation("   ")).toEqual({ hall: null, booth: null });
    expect(parseLocation(null)).toEqual({ hall: null, booth: null });
    expect(parseLocation(undefined)).toEqual({ hall: null, booth: null });
  });

  it("falls back to hall=raw when the pattern doesn't match", () => {
    expect(parseLocation("TBD")).toEqual({ hall: "TBD", booth: null });
  });
});

describe("interpack adapter — parseLetter()", () => {
  it("emits one row per profile entry, in input order", () => {
    const result = parseLetter(letterA);
    expect(result.map((r) => r.raw_name)).toEqual([
      "A&D Verpackungsmaschinenbau GmbH",
      "A-Z Color sp. z o. o. sp. k.",
      "AK Industries SL",
      "No Booth Yet GmbH",
    ]);
  });

  it("filters out trademark entries (parent profile is already in the list)", () => {
    const names = parseLetter(letterA).map((r) => r.raw_name);
    expect(names).not.toContain("AK RAMON");
  });

  it("populates country/hall/booth from location", () => {
    const result = parseLetter(letterA);
    expect(result[0]).toEqual({
      raw_name: "A&D Verpackungsmaschinenbau GmbH",
      country: "Germany",
      hall: "15",
      booth: "D42",
    });
  });

  it("emits null country/hall/booth for entries with empty fields", () => {
    const result = parseLetter(letterA);
    const noBooth = result.find((r) => r.raw_name === "No Booth Yet GmbH");
    expect(noBooth).toEqual({
      raw_name: "No Booth Yet GmbH",
      country: "Germany",
      hall: null,
      booth: null,
    });
  });

  it("returns [] for empty input", () => {
    expect(parseLetter([])).toEqual([]);
  });
});

describe("interpack adapter — fetch()", () => {
  function stubFetch(handler: (url: string) => unknown) {
    const fn = vi.fn(async (url: string, _init?: RequestInit) => ({
      ok: true,
      status: 200,
      json: async () => handler(url),
    }));
    vi.stubGlobal("fetch", fn);
    return fn;
  }

  it("walks meta links, fetches each filled letter, and merges results", async () => {
    const fn = stubFetch((url) => {
      if (url.endsWith("/directory/meta")) return dirMeta;
      // give every requested letter the same fixture so the count crosses 1000
      return Array.from({ length: 400 }, (_, i) => ({
        ...letterA[0],
        id: `profile=fake.${url.slice(-3)}.${i}`,
        name: `${letterA[0]?.name ?? "X"} ${url.slice(-3)} ${i}`,
      }));
    });

    const out = await interpackAdapter.fetch();
    expect(out.length).toBeGreaterThanOrEqual(1000);
    const calledUrls = fn.mock.calls.map((c) => c[0]);
    expect(calledUrls[0]).toContain("/directory/meta");
    expect(calledUrls).toContain(
      "https://www.interpack.com/vis-api/vis/v1/en/directory/a",
    );
    expect(calledUrls).toContain(
      "https://www.interpack.com/vis-api/vis/v1/en/directory/other",
    );
    expect(calledUrls).not.toContain(
      "https://www.interpack.com/vis-api/vis/v1/en/directory/q",
    );
    for (const c of fn.mock.calls) {
      const init = c[1] as { headers: Record<string, string> };
      expect(init.headers["X-Vis-Domain"]).toBe("www.interpack.com");
    }
  });

  it("dedupes by lowercased name across letters", async () => {
    stubFetch((url) => {
      if (url.endsWith("/directory/meta")) return dirMeta;
      return [letterA[0]]; // same single profile in every letter
    });
    await expect(interpackAdapter.fetch()).rejects.toThrow(
      /API shape may have changed/,
    );
  });

  it("throws when a letter request fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        if (url.endsWith("/directory/meta"))
          return { ok: true, status: 200, json: async () => dirMeta };
        return { ok: false, status: 503, json: async () => ({}) };
      }),
    );
    await expect(interpackAdapter.fetch()).rejects.toThrow(
      /interpack fetch .* failed: 503/,
    );
  });
});

describe("interpack adapter — meta", () => {
  it("declares slug, source, and source_url", () => {
    expect(interpackAdapter.meta).toMatchObject({
      source: "interpack",
      slug: "interpack-2026",
      year: 2026,
    });
    expect(interpackAdapter.meta.source_url).toMatch(/interpack\.com/);
  });
});
