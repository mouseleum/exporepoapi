import { describe, expect, it } from "vitest";
import {
  ADAPTER_FACTORIES,
  adapterFamilies,
  getAdapterFactory,
} from "../lib/adapters/registry";
import { buildAdapterForRow, type EventRow } from "../lib/library/load-event";

describe("adapter registry", () => {
  it("registers the dimedis and cyberseceurope families", () => {
    expect(getAdapterFactory("dimedis")).toBeDefined();
    expect(getAdapterFactory("cyberseceurope")).toBeDefined();
  });

  it("returns undefined for unknown families", () => {
    expect(getAdapterFactory("unknown")).toBeUndefined();
  });

  it("adapterFamilies lists the keys", () => {
    expect(adapterFamilies()).toEqual(
      expect.arrayContaining(["dimedis", "cyberseceurope"]),
    );
  });

  it("ADAPTER_FACTORIES exposes both factories as values", () => {
    expect(typeof ADAPTER_FACTORIES.dimedis).toBe("function");
    expect(typeof ADAPTER_FACTORIES.cyberseceurope).toBe("function");
  });
});

describe("buildAdapterForRow", () => {
  const baseRow: EventRow = {
    source: "cyberseceurope",
    slug: "cyberseceurope-2026",
    name: "Cybersec Europe 2026",
    year: 2026,
    source_url: "https://www.cyberseceurope.com/visit/exhibitor-list",
    adapter_config: {},
  };

  it("returns an adapter built from the registered factory", () => {
    const adapter = buildAdapterForRow(baseRow);
    expect(adapter.meta).toMatchObject({
      source: "cyberseceurope",
      slug: "cyberseceurope-2026",
      year: 2026,
    });
    expect(typeof adapter.fetch).toBe("function");
  });

  it("throws when the source family has no factory", () => {
    expect(() =>
      buildAdapterForRow({ ...baseRow, source: "unknown-family" }),
    ).toThrow(/no adapter family registered for source 'unknown-family'/);
  });

  it("passes adapter_config through to the factory (dimedis)", () => {
    const row: EventRow = {
      source: "dimedis",
      slug: "interpack-2026",
      name: "interpack 2026",
      year: 2026,
      source_url: "https://www.interpack.com/vis/v1/en/directory/a",
      adapter_config: { domain: "www.interpack.com", minExhibitors: 1000 },
    };
    const adapter = buildAdapterForRow(row);
    expect(adapter.meta.slug).toBe("interpack-2026");
  });

  it("rejects an invalid dimedis config (missing domain)", () => {
    const row: EventRow = {
      source: "dimedis",
      slug: "bad",
      name: "bad",
      year: null,
      source_url: "",
      adapter_config: { lang: "de" },
    };
    expect(() => buildAdapterForRow(row)).toThrow();
  });
});
