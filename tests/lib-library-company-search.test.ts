import { describe, expect, it } from "vitest";
import {
  buildCompanySearchIndex,
  fold,
  searchCompanies,
  type SearchableCompany,
} from "@/lib/library/company-search";

function company(over: Partial<SearchableCompany> & { name: string }): SearchableCompany {
  return {
    name_normalized: over.name.toLowerCase(),
    aliases: [],
    source: "apollo",
    country: null,
    country_sources: [],
    ...over,
  };
}

function names(rows: SearchableCompany[], q: string): string[] {
  return searchCompanies(buildCompanySearchIndex(rows), q).map((r) => r.name);
}

describe("fold", () => {
  it("lowercases and strips diacritics", () => {
    expect(fold("Müller Gmbh")).toBe("muller gmbh");
    expect(fold("Société Générale")).toBe("societe generale");
    expect(fold("ŠKODA")).toBe("skoda");
  });

  it("leaves plain ascii untouched", () => {
    expect(fold("Siemens AG")).toBe("siemens ag");
  });
});

describe("searchCompanies", () => {
  const rows = [
    company({ name: "Senseye - A Siemens business" }),
    company({ name: "Siemens AG", country: "DE" }),
    company({ name: "SIEMENS", country: "DE" }),
    company({ name: "Müller Maschinen", country: "DE" }),
    company({
      name: "Vestas",
      country: "DK",
      source: "WindEurope Madrid 2026",
      country_sources: ["WindEurope Madrid 2026"],
    }),
    company({ name: "Acme", aliases: ["Acme Corporation"] }),
  ];

  it("returns input order for empty query", () => {
    expect(names(rows, "")).toEqual(rows.map((r) => r.name));
    expect(names(rows, "   ")).toEqual(rows.map((r) => r.name));
  });

  it("ranks exact > prefix > substring", () => {
    expect(names(rows, "siemens")).toEqual([
      "SIEMENS",
      "Siemens AG",
      "Senseye - A Siemens business",
    ]);
  });

  it("is diacritic-insensitive both ways", () => {
    expect(names(rows, "muller")).toEqual(["Müller Maschinen"]);
    expect(names(rows, "müller")).toEqual(["Müller Maschinen"]);
  });

  it("matches aliases at name-level ranks", () => {
    expect(names(rows, "acme corporation")).toEqual(["Acme"]);
    expect(names(rows, "corporation")).toEqual(["Acme"]);
  });

  it("matches event/source names", () => {
    expect(names(rows, "windeurope")).toEqual(["Vestas"]);
    expect(names(rows, "madrid")).toEqual(["Vestas"]);
  });

  it("matches country by ISO code and display name", () => {
    expect(names(rows, "denmark")).toEqual(["Vestas"]);
    // "de" hits DE rows via exact meta match; name matches would outrank them.
    expect(names(rows, "de")).toEqual([
      "Siemens AG",
      "SIEMENS",
      "Müller Maschinen",
    ]);
  });

  it("does not substring-match metadata below 3 chars", () => {
    // "ma" appears in "WindEurope Madrid 2026" but must not match Vestas...
    expect(names(rows, "ma")).not.toContain("Vestas");
    // ...while name substrings still work at any length.
    expect(names(rows, "ma")).toContain("Müller Maschinen");
  });

  it("ranks name matches above metadata matches", () => {
    const mixed = [
      company({ name: "Hamburg Cranes", country: "DE" }),
      company({ name: "Acme", country: "DE", source: "Hamburg Expo 2026" }),
    ];
    expect(names(mixed, "hamburg")).toEqual(["Hamburg Cranes", "Acme"]);
  });

  it("matches colloquial country names (CLDR calls TR 'Türkiye')", () => {
    const world = [
      company({ name: "Arçelik", country: "TR" }),
      company({ name: "Dyson", country: "GB" }),
      company({ name: "Philips", country: "NL" }),
    ];
    expect(names(world, "turkey")).toEqual(["Arçelik"]);
    expect(names(world, "uk")).toEqual(["Dyson"]);
    expect(names(world, "holland")).toEqual(["Philips"]);
  });

  it("handles free-text countries that are not ISO codes", () => {
    const freeText = [company({ name: "Siemens Energy Global", country: "Germany" })];
    expect(names(freeText, "germany")).toEqual(["Siemens Energy Global"]);
  });
});
