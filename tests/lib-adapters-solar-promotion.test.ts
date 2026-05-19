import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  isSolarPromotionHost,
  parsePage,
  solarPromotionFactory,
} from "../lib/adapters/solar-promotion";
import type { EventMeta } from "../lib/adapters/types";

const PAGE_FIXTURE = readFileSync(
  join(__dirname, "fixtures/solar-promotion-page.html"),
  "utf8",
);

const META: EventMeta = {
  source: "solar-promotion",
  slug: "smarter-e-2026",
  name: "The smarter E Europe 2026",
  year: 2026,
  source_url: "https://www.thesmartere.de/exhibitorlist",
};

const PAGE_HTML = `<!doctype html><html><body>
<input type="hidden" class="static-search-filters" data-type="menuPageTypes" data-value="5ef3588ed984e36063189652" name="menuPageTypes" />
<input type="hidden" id="menuPageId" name="menuPageId" value="5f59eef0a57002294671be62" />
</body></html>`;

const DEFAULT_JS = `var csrfToken = "08d6c440-36fb-4f15-87fe-32e4e68a80da";`;

function mockResponse(
  body: string,
  init: { status?: number; setCookie?: string | string[] } = {},
): Response {
  const headers = new Headers();
  if (init.setCookie) {
    const list = Array.isArray(init.setCookie) ? init.setCookie : [init.setCookie];
    for (const c of list) headers.append("set-cookie", c);
  }
  return new Response(body, {
    status: init.status ?? 200,
    headers,
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("solar-promotion — isSolarPromotionHost", () => {
  it("matches the five sister hosts (with or without www)", () => {
    for (const h of [
      "thesmartere.de",
      "www.thesmartere.de",
      "intersolar.de",
      "www.intersolar.de",
      "ees-europe.com",
      "www.ees-europe.com",
      "powertodrive.de",
      "www.powertodrive.de",
      "em-power.eu",
      "www.em-power.eu",
    ]) {
      expect(isSolarPromotionHost(h)).toBe(true);
    }
  });

  it("rejects unrelated hosts", () => {
    for (const h of ["example.com", "thesmartere.com", "intersolar.com"]) {
      expect(isSolarPromotionHost(h)).toBe(false);
    }
  });
});

describe("solar-promotion — parsePage()", () => {
  it("extracts name, country, booth, source_id per teaser", () => {
    const rows = parsePage(PAGE_FIXTURE);
    expect(rows).toEqual([
      {
        raw_name: "21PV GmbH",
        country: "Germany",
        hall: null,
        booth: "C4.280G",
        source_id: "69b42dbf40bd5f7d8c204e20",
      },
      {
        raw_name: "2B automation d.o.o.",
        country: "Croatia",
        hall: null,
        booth: "B0.155",
        source_id: "69a7e82d2afd6d1b222ca1c1",
      },
      {
        raw_name: "2nd Cycle FlexCo",
        country: "Austria",
        hall: null,
        booth: "C4.670K",
        source_id: "698da737dd49624cd5c43bbc",
      },
    ]);
  });

  it("returns [] on an empty page", () => {
    expect(parsePage("")).toEqual([]);
    expect(parsePage("<div>nothing</div>")).toEqual([]);
  });

  it("decodes HTML entities in the name", () => {
    const rows = parsePage(
      `<a class="teaser" data-content-id="abc123def4567890">
        <div class="list-item-heading">
          <div>Z9.001</div>
          <span class="h3">AIP GmbH &amp; co. KG</span>
        </div>
        <div class="list-item-image"></div>
        <div class="list-item-meta">
          <div><span class="h2">ees Europe</span></div>
          <div class="list-item-meta-teaser-container">
            <span class="h2">France</span>
          </div>
        </div>
       </a>`,
    );
    expect(rows[0]?.raw_name).toBe("AIP GmbH & co. KG");
  });

  it("skips teasers without an h3 name", () => {
    const rows = parsePage(
      `<a class="teaser" data-content-id="abc123def4567890">
        <div class="list-item-heading"><div>A1.001</div></div>
        <div class="list-item-image"></div>
       </a>`,
    );
    expect(rows).toEqual([]);
  });
});

describe("solar-promotion — fetch()", () => {
  it("bootstraps, posts /search/execute, paginates, returns merged exhibitors", async () => {
    const fn = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input.toString();
      if (url === META.source_url) {
        return mockResponse(PAGE_HTML, {
          setCookie: "tsefrontend=ABC123; Path=/; HttpOnly",
        });
      }
      if (url.endsWith("/wc/js/default.js")) {
        return mockResponse(DEFAULT_JS);
      }
      if (url.endsWith("/search/execute")) {
        const body = JSON.parse(String(init?.body ?? "{}"));
        return mockResponse(body.page === 1 ? PAGE_FIXTURE : "");
      }
      throw new Error(`unexpected fetch: ${url}`);
    });
    vi.stubGlobal("fetch", fn);

    const adapter = solarPromotionFactory(META, { minExhibitors: 3 });
    const rows = await adapter.fetch();
    expect(rows.map((r) => r.raw_name)).toEqual([
      "21PV GmbH",
      "2B automation d.o.o.",
      "2nd Cycle FlexCo",
    ]);

    const postCalls = fn.mock.calls.filter(
      ([u]) =>
        (typeof u === "string" ? u : u.toString()).endsWith("/search/execute"),
    );
    expect(postCalls.length).toBeGreaterThanOrEqual(1);
    const [postUrl, postInit] = postCalls[0]!;
    expect(typeof postUrl === "string" ? postUrl : postUrl.toString()).toBe(
      "https://www.thesmartere.de/search/execute",
    );
    const headers = postInit?.headers as Record<string, string>;
    expect(headers["X-CSRF-TOKEN"]).toBe(
      "08d6c440-36fb-4f15-87fe-32e4e68a80da",
    );
    expect(headers.Cookie).toContain("tsefrontend=ABC123");
    const sent = JSON.parse(String(postInit?.body));
    expect(sent.menuPageId).toBe("5f59eef0a57002294671be62");
    expect(sent.menuPageTypes).toEqual(["5ef3588ed984e36063189652"]);
  });

  it("throws when the bootstrap page returns non-2xx", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => mockResponse("", { status: 503 })),
    );
    const adapter = solarPromotionFactory(META, {});
    await expect(adapter.fetch()).rejects.toThrow(
      /solar-promotion bootstrap GET .* failed: 503/,
    );
  });

  it("throws when the session cookie is missing", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => mockResponse(PAGE_HTML)),
    );
    const adapter = solarPromotionFactory(META, {});
    await expect(adapter.fetch()).rejects.toThrow(
      /tsefrontend session cookie/,
    );
  });

  it("throws when the CSRF token is missing from default.js", async () => {
    const fn = vi.fn(async (input: string | URL | Request) => {
      const url = typeof input === "string" ? input : input.toString();
      if (url === META.source_url) {
        return mockResponse(PAGE_HTML, {
          setCookie: "tsefrontend=ABC123; Path=/; HttpOnly",
        });
      }
      if (url.endsWith("/wc/js/default.js")) {
        return mockResponse("// no csrf here");
      }
      throw new Error(`unexpected fetch: ${url}`);
    });
    vi.stubGlobal("fetch", fn);
    const adapter = solarPromotionFactory(META, {});
    await expect(adapter.fetch()).rejects.toThrow(/csrfToken not found/);
  });

  it("throws when too few exhibitors are returned (shape guard)", async () => {
    const fn = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input.toString();
      if (url === META.source_url) {
        return mockResponse(PAGE_HTML, {
          setCookie: "tsefrontend=ABC123; Path=/; HttpOnly",
        });
      }
      if (url.endsWith("/wc/js/default.js")) return mockResponse(DEFAULT_JS);
      if (url.endsWith("/search/execute")) {
        const body = JSON.parse(String(init?.body ?? "{}"));
        return mockResponse(body.page === 1 ? PAGE_FIXTURE : "");
      }
      throw new Error(`unexpected fetch: ${url}`);
    });
    vi.stubGlobal("fetch", fn);
    const adapter = solarPromotionFactory(META, {}); // default min=50
    await expect(adapter.fetch()).rejects.toThrow(/page layout may have changed/);
  });

  it("honors menuPageId / menuPageTypes overrides from config", async () => {
    const fn = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input.toString();
      if (url === META.source_url) {
        return mockResponse("<html></html>", {
          // Page has no menuPageId / menuPageTypes; config supplies both.
          setCookie: "tsefrontend=ABC123; Path=/; HttpOnly",
        });
      }
      if (url.endsWith("/wc/js/default.js")) return mockResponse(DEFAULT_JS);
      if (url.endsWith("/search/execute")) {
        const body = JSON.parse(String(init?.body ?? "{}"));
        return mockResponse(body.page === 1 ? PAGE_FIXTURE : "");
      }
      throw new Error(`unexpected fetch: ${url}`);
    });
    vi.stubGlobal("fetch", fn);

    const adapter = solarPromotionFactory(META, {
      menuPageId: "OVERRIDE_ID",
      menuPageTypes: ["OVERRIDE_TYPE"],
      minExhibitors: 3,
    });
    const rows = await adapter.fetch();
    expect(rows).toHaveLength(3);
    const postCall = fn.mock.calls.find(([u]) =>
      (typeof u === "string" ? u : u.toString()).endsWith("/search/execute"),
    )!;
    const sent = JSON.parse(String((postCall[1] as RequestInit).body));
    expect(sent.menuPageId).toBe("OVERRIDE_ID");
    expect(sent.menuPageTypes).toEqual(["OVERRIDE_TYPE"]);
  });
});

describe("solar-promotion — config", () => {
  it("accepts an empty config object", () => {
    expect(() => solarPromotionFactory(META, {})).not.toThrow();
  });

  it("rejects an invalid menuPageTypes shape", () => {
    expect(() =>
      solarPromotionFactory(META, { menuPageTypes: [] }),
    ).toThrow();
    expect(() =>
      solarPromotionFactory(META, { menuPageTypes: [""] }),
    ).toThrow();
  });

  it("the factory returns an Adapter whose meta is the input meta", () => {
    const adapter = solarPromotionFactory(META, {});
    expect(adapter.meta).toEqual(META);
  });
});
