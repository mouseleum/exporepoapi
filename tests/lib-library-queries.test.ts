import { describe, expect, it } from "vitest";
import { joinEventExhibitors } from "../lib/library/queries";

describe("joinEventExhibitors", () => {
  it("returns [] when both inputs are empty", () => {
    expect(joinEventExhibitors([], [])).toEqual([]);
  });

  it("returns rows with apollo_matched=false when no Apollo matches exist", () => {
    const result = joinEventExhibitors(
      [
        {
          raw_name: "Acen NV",
          country: null,
          hall: null,
          booth: null,
          name_normalized: "acennv",
        },
      ],
      [],
    );
    expect(result).toEqual([
      {
        raw_name: "Acen NV",
        country: "",
        hall: "",
        booth: null,
        employees: null,
        industry: null,
        apollo_matched: false,
      },
    ]);
  });

  it("populates enrichment fields and sets apollo_matched=true on match", () => {
    const result = joinEventExhibitors(
      [
        {
          raw_name: "Signify",
          country: null,
          hall: null,
          booth: null,
          name_normalized: "signify",
        },
      ],
      [
        {
          name_normalized: "signify",
          country: "Netherlands",
          employees: 68000,
          industry: "lighting",
        },
      ],
    );
    expect(result[0]).toMatchObject({
      raw_name: "Signify",
      country: "Netherlands",
      employees: 68000,
      industry: "lighting",
      apollo_matched: true,
    });
  });

  it("country precedence: event_exhibitors.country wins over Apollo", () => {
    const result = joinEventExhibitors(
      [
        {
          raw_name: "Acme",
          country: "DE",
          hall: null,
          booth: null,
          name_normalized: "acme",
        },
      ],
      [
        {
          name_normalized: "acme",
          country: "US",
          employees: 200,
          industry: "tech",
        },
      ],
    );
    expect(result[0]?.country).toBe("DE");
  });

  it("country fallback: when ee.country is empty, Apollo's country is used", () => {
    const result = joinEventExhibitors(
      [
        {
          raw_name: "Acme",
          country: "",
          hall: null,
          booth: null,
          name_normalized: "acme",
        },
      ],
      [
        {
          name_normalized: "acme",
          country: "US",
          employees: 200,
          industry: "tech",
        },
      ],
    );
    expect(result[0]?.country).toBe("US");
  });

  it("country fallback: when both are null/empty, country is empty string", () => {
    const result = joinEventExhibitors(
      [
        {
          raw_name: "Mystery",
          country: null,
          hall: null,
          booth: null,
          name_normalized: "mystery",
        },
      ],
      [
        {
          name_normalized: "mystery",
          country: null,
          employees: null,
          industry: null,
        },
      ],
    );
    expect(result[0]?.country).toBe("");
  });

  it("preserves hall and booth from event_exhibitors", () => {
    const result = joinEventExhibitors(
      [
        {
          raw_name: "Acme",
          country: null,
          hall: "5B116",
          booth: "B12",
          name_normalized: "acme",
        },
      ],
      [],
    );
    expect(result[0]).toMatchObject({ hall: "5B116", booth: "B12" });
  });

  it("preserves order of event_exhibitors input", () => {
    const result = joinEventExhibitors(
      [
        { raw_name: "B Co", country: null, hall: null, booth: null, name_normalized: "bco" },
        { raw_name: "A Co", country: null, hall: null, booth: null, name_normalized: "aco" },
        { raw_name: "C Co", country: null, hall: null, booth: null, name_normalized: "cco" },
      ],
      [],
    );
    expect(result.map((r) => r.raw_name)).toEqual(["B Co", "A Co", "C Co"]);
  });
});
