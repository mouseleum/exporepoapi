import { afterEach, describe, expect, it, vi } from "vitest";
import {
  inferEventFromUrl,
  parseSwapcardNextData,
} from "../lib/library/infer-event-from-url";
import { DimedisConfigSchema } from "../lib/adapters/dimedis";
import { MapYourShowConfigSchema } from "../lib/adapters/mapyourshow";
import { ExpoFpConfigSchema } from "../lib/adapters/expofp";
import { SwapcardConfigSchema } from "../lib/adapters/swapcard";

const SWAP_HTML = (event: {
  id: string;
  title: string;
  beginsAt?: string;
}) => `<!DOCTYPE html><html><head><title>Exhibitor List</title></head><body>
<script id="__NEXT_DATA__" type="application/json">${JSON.stringify({
  props: {
    pageProps: {
      activeEventSlug: "vitafoods-europe-2026",
      event: {
        __typename: "Core_Event",
        id: event.id,
        title: event.title,
        beginsAt: event.beginsAt ?? null,
      },
    },
  },
})}</script>
</body></html>`;

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("inferEventFromUrl — non-network families", () => {
  it("cyberseceurope: hostname is enough", async () => {
    const out = await inferEventFromUrl(
      "https://www.cyberseceurope.com/visit/exhibitor-list",
    );
    expect(out?.family).toBe("cyberseceurope");
    expect(out?.adapter_config).toEqual({});
  });

  it("mapyourshow: domain comes from host", async () => {
    const out = await inferEventFromUrl(
      "https://tbse26.mapyourshow.com/8_0/explore/exhibitor-gallery.cfm?featured=false",
    );
    expect(out?.family).toBe("mapyourshow");
    expect(out?.adapter_config).toEqual({ domain: "tbse26.mapyourshow.com" });
    // No 4-digit year in URL — leave the field empty for the user to fill.
    expect(out?.suggestedYear).toBeUndefined();
    expect(() => MapYourShowConfigSchema.parse(out?.adapter_config)).not.toThrow();
  });

  it("year regex picks up a 4-digit year when present", async () => {
    const out = await inferEventFromUrl(
      "https://www.drupa.com/vis/v1/en/directory/a?show=2028",
    );
    expect(out?.family).toBe("dimedis");
    expect(out?.suggestedYear).toBe(2028);
  });

  it("dimedis: domain + lang come from path", async () => {
    const out = await inferEventFromUrl(
      "https://www.interpack.com/vis/v1/de/directory/a",
    );
    expect(out?.family).toBe("dimedis");
    expect(out?.adapter_config).toEqual({
      domain: "www.interpack.com",
      lang: "de",
    });
    expect(() => DimedisConfigSchema.parse(out?.adapter_config)).not.toThrow();
  });

  it("expofp: expoKey from ?expoKey query param", async () => {
    const out = await inferEventFromUrl(
      "https://app.expofp.com/home/testexhibitorlist?expoKey=mbsfestival",
    );
    expect(out?.family).toBe("expofp");
    expect(out?.adapter_config).toEqual({ expoKey: "mbsfestival" });
    expect(() => ExpoFpConfigSchema.parse(out?.adapter_config)).not.toThrow();
  });

  it("expofp: expoKey from subdomain", async () => {
    const out = await inferEventFromUrl(
      "https://mbsfestival.expofp.com/data/data.js",
    );
    expect(out?.family).toBe("expofp");
    expect(out?.adapter_config).toEqual({ expoKey: "mbsfestival" });
  });
});

describe("inferEventFromUrl — swapcard", () => {
  const VITAFOODS_URL =
    "https://visitor.vitafoodsglobal.com/event/vitafoods-europe-2026/exhibitors/RXZlbnRWaWV3XzEyNDIzNjc=";

  it("fetches the page and pulls eventId + name + year from __NEXT_DATA__", async () => {
    const html = SWAP_HTML({
      id: "RXZlbnRfNDI4MjIxMQ==",
      title: "Vitafoods Europe 2026",
      beginsAt: "2026-05-05T09:00:00+02:00",
    });
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        status: 200,
        text: async () => html,
      })),
    );
    const out = await inferEventFromUrl(VITAFOODS_URL);
    expect(out?.family).toBe("swapcard");
    expect(out?.adapter_config).toEqual({
      viewId: "RXZlbnRWaWV3XzEyNDIzNjc=",
      eventId: "RXZlbnRfNDI4MjIxMQ==",
    });
    expect(out?.suggestedName).toBe("Vitafoods Europe 2026");
    expect(out?.suggestedYear).toBe(2026);
    expect(out?.partial).toBeUndefined();
    expect(() => SwapcardConfigSchema.parse(out?.adapter_config)).not.toThrow();
  });

  it("returns partial with viewId only when the page fetch fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: false, status: 503, text: async () => "" })),
    );
    const out = await inferEventFromUrl(VITAFOODS_URL);
    expect(out?.family).toBe("swapcard");
    expect(out?.partial).toBe(true);
    expect(out?.warning).toMatch(/Couldn't fetch/);
    expect(out?.adapter_config).toEqual({
      viewId: "RXZlbnRWaWV3XzEyNDIzNjc=",
    });
    expect(out?.suggestedYear).toBe(2026);
  });

  it("returns partial when the page is a Client Challenge", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        status: 200,
        text: async () => "<html><title>Client Challenge</title></html>",
      })),
    );
    const out = await inferEventFromUrl(VITAFOODS_URL);
    expect(out?.partial).toBe(true);
    expect(out?.warning).toMatch(/bot challenge/);
  });

  it("returns partial when __NEXT_DATA__ exists but lacks the event", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        status: 200,
        text: async () =>
          `<script id="__NEXT_DATA__" type="application/json">${JSON.stringify({ props: { pageProps: {} } })}</script>`,
      })),
    );
    const out = await inferEventFromUrl(VITAFOODS_URL);
    expect(out?.partial).toBe(true);
    expect(out?.warning).toMatch(/eventId not found/);
  });

  it("falls back to a deep walk when pageProps.event is missing", () => {
    const html = `<script id="__NEXT_DATA__" type="application/json">${JSON.stringify(
      {
        props: {
          pageProps: {
            __APOLLO_STATE__: {
              "Core_Event:RXZlbnRfMQ==": {
                __typename: "Core_Event",
                id: "RXZlbnRfMQ==",
                title: "Found Event",
              },
            },
          },
        },
      },
    )}</script>`;
    const event = parseSwapcardNextData(html);
    expect(event?.id).toBe("RXZlbnRfMQ==");
    expect(event?.title).toBe("Found Event");
  });
});

describe("inferEventFromUrl — rejection paths", () => {
  it("returns null for unknown hosts", async () => {
    // Stub fetch so the iframe-sniff fallback doesn't hit the real network.
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: false, status: 404, text: async () => "" })),
    );
    const out = await inferEventFromUrl("https://example.org/foo");
    expect(out).toBeNull();
  });

  it("returns null for garbage input", async () => {
    expect(await inferEventFromUrl("")).toBeNull();
    expect(await inferEventFromUrl("not a url")).toBeNull();
    expect(await inferEventFromUrl("javascript:alert(1)")).toBeNull();
  });
});

describe("inferEventFromUrl — swapcard white labels", () => {
  it("detects attendees.toc-go.com/widget/event/.../exhibitors/<viewId>", async () => {
    const html = SWAP_HTML({
      id: "RXZlbnRfNDMyNTEwMQ==",
      title: "TOC Europe & CSC Live 2026",
      beginsAt: "2026-05-19T09:00:00+02:00",
    });
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: true, status: 200, text: async () => html })),
    );
    const out = await inferEventFromUrl(
      "https://attendees.toc-go.com/widget/event/toc-europe-and-csc-live-2026/exhibitors/RXZlbnRWaWV3XzEyNTUyNzg=",
    );
    expect(out?.family).toBe("swapcard");
    expect(out?.adapter_config).toEqual({
      viewId: "RXZlbnRWaWV3XzEyNTUyNzg=",
      eventId: "RXZlbnRfNDMyNTEwMQ==",
    });
    expect(out?.suggestedName).toBe("TOC Europe & CSC Live 2026");
    expect(out?.suggestedYear).toBe(2026);
  });

  it("rejects /exhibitors/<not-a-viewId>", async () => {
    const out = await inferEventFromUrl(
      "https://example.com/event/foo/exhibitors/notavalidviewid",
    );
    expect(out).toBeNull();
  });
});

describe("inferEventFromUrl — iframe-sniff fallback", () => {
  const OUTER_URL = "https://www.tocevents-europe.com/en/attend/exhibitor-list.html";
  const INNER_VIEW_ID = "RXZlbnRWaWV3XzEyNTUyNzg=";
  const INNER_URL = `https://attendees.toc-go.com/widget/event/toc-europe-and-csc-live-2026/exhibitors/${INNER_VIEW_ID}`;

  it("follows an iframe to a Swapcard URL and resolves it", async () => {
    const outerHtml = `<html><body><iframe src="${INNER_URL}?source=iframe-only"></iframe></body></html>`;
    const innerHtml = SWAP_HTML({
      id: "RXZlbnRfNDMyNTEwMQ==",
      title: "TOC Europe & CSC Live 2026",
      beginsAt: "2026-05-19T09:00:00+02:00",
    });
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          text: async () => outerHtml,
        })
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          text: async () => innerHtml,
        }),
    );
    const out = await inferEventFromUrl(OUTER_URL);
    expect(out?.family).toBe("swapcard");
    expect(out?.adapter_config).toMatchObject({
      viewId: INNER_VIEW_ID,
      eventId: "RXZlbnRfNDMyNTEwMQ==",
    });
  });

  it("gives up gracefully when the outer page is Cloudflare-walled", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        status: 200,
        text: async () =>
          "<html><title>Attention Required! | Cloudflare</title></html>",
      })),
    );
    const out = await inferEventFromUrl(OUTER_URL);
    expect(out).toBeNull();
  });

  it("returns null when the page has no recognisable iframe", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        status: 200,
        text: async () => "<html><body><p>no iframes here</p></body></html>",
      })),
    );
    const out = await inferEventFromUrl(OUTER_URL);
    expect(out).toBeNull();
  });
});
