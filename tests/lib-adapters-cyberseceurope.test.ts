import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cyberseceuropeFactory, parse } from "../lib/adapters/cyberseceurope";
import type { EventMeta } from "../lib/adapters/types";

const fixture = readFileSync(
  join(__dirname, "fixtures/cyberseceurope.html"),
  "utf8",
);

const META: EventMeta = {
  source: "cyberseceurope",
  slug: "cyberseceurope-2026",
  name: "Cybersec Europe 2026",
  year: 2026,
  source_url: "https://www.cyberseceurope.com/visit/exhibitor-list",
};

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("cyberseceurope adapter — parse()", () => {
  it("extracts all exhibitors from the fixture in document order", () => {
    const result = parse(fixture);
    expect(result.map((r) => r.raw_name)).toEqual([
      "Acen NV",
      "Aikido Security",
      "Alistar",
      "APPROACH CYBER \u2013 AXS GUARD",
      "Atos",
      "B2C Group",
      "Bechtle & Co",
      "Belgian Cyber Command",
      "Blue Lance, Inc.",
      "Brand Compliance BV",
      "Citrix",
      "Cloudflare",
      "Cobalt",
      "CrowdStrike",
      "CyberArk",
    ]);
  });

  it("decodes named and numeric HTML entities", () => {
    const result = parse(fixture);
    const names = result.map((r) => r.raw_name);
    expect(names).toContain("APPROACH CYBER \u2013 AXS GUARD");
    expect(names).toContain("Bechtle & Co");
    for (const n of names) expect(n).not.toMatch(/&#?\w+;/);
  });

  it("does not emit the single-letter section header as an exhibitor", () => {
    const result = parse(fixture);
    expect(result.map((r) => r.raw_name)).not.toContain("A");
    expect(result.map((r) => r.raw_name)).not.toContain("B");
    expect(result.map((r) => r.raw_name)).not.toContain("C");
  });

  it("filters empty and whitespace-only entries", () => {
    const html =
      "<p><strong>X</strong><br />Real Co<br />   <br /><br />Another</p>";
    expect(parse(html).map((r) => r.raw_name)).toEqual(["Real Co", "Another"]);
  });

  it("tolerates both <br /> and <br/> self-closing variants", () => {
    const result = parse(fixture);
    expect(result.length).toBe(15);
  });

  it("returns [] for empty input", () => {
    expect(parse("")).toEqual([]);
  });

  it("ignores <p><strong>multi-char</strong> blocks (not section headers)", () => {
    const html = "<p><strong>extra</strong> not a section</p>";
    expect(parse(html)).toEqual([]);
  });

  it("only populates raw_name (no booth/hall/country for this source)", () => {
    const result = parse(fixture);
    expect(result[0]).toEqual({ raw_name: "Acen NV" });
  });
});

describe("cyberseceurope adapter — fetch()", () => {
  it("fetches the meta source_url, parses, and returns exhibitors", async () => {
    const fn = vi.fn(async () => ({
      ok: true,
      status: 200,
      text: async () => fixture.repeat(8),
    }));
    vi.stubGlobal("fetch", fn);
    const adapter = cyberseceuropeFactory(META, {});
    const out = await adapter.fetch();
    expect(out.length).toBeGreaterThanOrEqual(50);
    expect(fn).toHaveBeenCalledTimes(1);
    expect(fn).toHaveBeenCalledWith(
      META.source_url,
      expect.objectContaining({ headers: expect.anything() }),
    );
  });

  it("throws when the response is not ok", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: false, status: 503, text: async () => "" })),
    );
    const adapter = cyberseceuropeFactory(META, {});
    await expect(adapter.fetch()).rejects.toThrow(
      /cyberseceurope fetch failed: 503/,
    );
  });

  it("throws when too few exhibitors are parsed (layout sanity guard)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        status: 200,
        text: async () => "<html><body><p>nothing here</p></body></html>",
      })),
    );
    const adapter = cyberseceuropeFactory(META, {});
    await expect(adapter.fetch()).rejects.toThrow(/page layout may have changed/);
  });
});

describe("cyberseceurope adapter — meta passthrough", () => {
  it("the factory returns an Adapter whose meta is the input meta", () => {
    const adapter = cyberseceuropeFactory(META, {});
    expect(adapter.meta).toEqual(META);
  });

  it("ignores its config argument", () => {
    const adapter = cyberseceuropeFactory(META, { ignored: "yes" });
    expect(adapter.meta).toEqual(META);
  });
});
