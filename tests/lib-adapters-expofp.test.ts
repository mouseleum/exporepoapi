import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { expofpFactory, parse } from "../lib/adapters/expofp";
import type { EventMeta } from "../lib/adapters/types";

const fixture = readFileSync(
  join(__dirname, "fixtures/expofp-data.js"),
  "utf8",
);

const META: EventMeta = {
  source: "expofp",
  slug: "mbsfestival-2024",
  name: "MindBodySpirit Festival Melbourne 2024",
  year: 2024,
  source_url: "https://app.expofp.com/home/testexhibitorlist?expoKey=mbsfestival",
};

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("expofp adapter — parse()", () => {
  it("extracts exhibitors with booth join and country", () => {
    const rows = parse(fixture);
    expect(rows).toEqual([
      { raw_name: "Acme Corp", country: "USA", hall: null, booth: "A12" },
      { raw_name: "Beta Industries", country: null, hall: null, booth: "B07" },
      { raw_name: "Charlie Co", country: null, hall: null, booth: "B07" },
      { raw_name: "Delta Ltd", country: "UK", hall: null, booth: null },
    ]);
  });

  it("skips exhibitors with empty/whitespace names", () => {
    const rows = parse(fixture);
    expect(rows.find((r) => r.raw_name.trim() === "")).toBeUndefined();
  });

  it("deduplicates by lowercased name (first occurrence wins)", () => {
    const rows = parse(fixture);
    const acme = rows.filter((r) => r.raw_name === "Acme Corp");
    expect(acme).toHaveLength(1);
    expect(acme[0]?.country).toBe("USA");
  });

  it("treats whitespace-only booth names as no booth", () => {
    const rows = parse(fixture);
    const delta = rows.find((r) => r.raw_name === "Delta Ltd");
    expect(delta?.booth).toBeNull();
  });

  it("strips a BOM prefix on the script body", () => {
    const rows = parse("﻿" + fixture);
    expect(rows[0]?.raw_name).toBe("Acme Corp");
  });

  it("returns [] when there are no exhibitors", () => {
    expect(parse("var __data = {};")).toEqual([]);
    expect(parse("var __data = {\"exhibitors\":[]};")).toEqual([]);
  });

  it("throws on non-JSON garbage", () => {
    expect(() => parse("not javascript at all")).toThrow();
  });
});

describe("expofp adapter — fetch()", () => {
  it("fetches data.js from the expoKey subdomain and parses", async () => {
    // repeat the 4-real-exhibitor fixture enough times to clear the min guard;
    // dedup means the count will collapse, so use a generated big fixture instead.
    const many = makeBigFixture(100);
    const fn = vi.fn(async () => ({
      ok: true,
      status: 200,
      text: async () => many,
    }));
    vi.stubGlobal("fetch", fn);
    const adapter = expofpFactory(META, { expoKey: "mbsfestival" });
    const out = await adapter.fetch();
    expect(out.length).toBeGreaterThanOrEqual(50);
    expect(fn).toHaveBeenCalledTimes(1);
    expect(fn).toHaveBeenCalledWith(
      "https://mbsfestival.expofp.com/data/data.js",
      expect.objectContaining({ headers: expect.anything() }),
    );
  });

  it("throws when the response is not ok", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: false, status: 503, text: async () => "" })),
    );
    const adapter = expofpFactory(META, { expoKey: "mbsfestival" });
    await expect(adapter.fetch()).rejects.toThrow(/expofp fetch failed: 503/);
  });

  it("throws when too few exhibitors are parsed (data shape guard)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        status: 200,
        text: async () => fixture, // only 4 unique exhibitors, below default min=50
      })),
    );
    const adapter = expofpFactory(META, { expoKey: "mbsfestival" });
    await expect(adapter.fetch()).rejects.toThrow(/data\.js shape may have changed/);
  });

  it("respects a custom minExhibitors override", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        status: 200,
        text: async () => fixture,
      })),
    );
    const adapter = expofpFactory(META, {
      expoKey: "mbsfestival",
      minExhibitors: 3,
    });
    const out = await adapter.fetch();
    expect(out).toHaveLength(4);
  });
});

describe("expofp adapter — config + meta", () => {
  it("rejects config without expoKey", () => {
    expect(() => expofpFactory(META, {})).toThrow();
    expect(() => expofpFactory(META, { expoKey: "" })).toThrow();
  });

  it("the factory returns an Adapter whose meta is the input meta", () => {
    const adapter = expofpFactory(META, { expoKey: "mbsfestival" });
    expect(adapter.meta).toEqual(META);
  });
});

function makeBigFixture(n: number): string {
  const exhibitors = Array.from({ length: n }, (_, i) => ({
    id: 10000 + i,
    name: `Exhibitor ${i}`,
    country: i % 3 === 0 ? "USA" : null,
  }));
  const booths = Array.from({ length: n }, (_, i) => ({
    id: i + 1,
    name: `B${String(i).padStart(3, "0")}`,
    exhibitors: [10000 + i],
  }));
  return `var __data = ${JSON.stringify({ exhibitors, booths })};`;
}
