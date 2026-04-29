import { describe, expect, it } from "vitest";
import {
  mapApolloRow,
  MissingApolloIdError,
  normalizeName,
} from "../scripts/apollo-row";

const FIXED_ID = "63f7a31a826bb90001552980";

function row(overrides: Record<string, string> = {}): Record<string, string> {
  return {
    "Company Name": "Acme Inc",
    "Apollo Account Id": FIXED_ID,
    ...overrides,
  };
}

describe("normalizeName", () => {
  it("lowercases and strips non-alphanumerics", () => {
    expect(normalizeName("Acme, Inc.")).toBe("acmeinc");
    expect(normalizeName("L'Oréal")).toBe("loral");
    expect(normalizeName("AT&T")).toBe("att");
    expect(normalizeName("  Foo Bar 123  ")).toBe("foobar123");
  });
});

describe("mapApolloRow — required fields", () => {
  it("throws MissingApolloIdError when Apollo Account Id is missing", () => {
    expect(() =>
      mapApolloRow({ "Company Name": "X", "Apollo Account Id": "" }),
    ).toThrow(MissingApolloIdError);
  });

  it("throws when Company Name is missing", () => {
    expect(() =>
      mapApolloRow({ "Company Name": "", "Apollo Account Id": FIXED_ID }),
    ).toThrow(/missing Company Name/);
  });

  it("populates name + name_normalized + apollo_account_id", () => {
    const out = mapApolloRow(row({ "Company Name": "Signify" }));
    expect(out.name).toBe("Signify");
    expect(out.name_normalized).toBe("signify");
    expect(out.apollo_account_id).toBe(FIXED_ID);
    expect(out.source).toBe("apollo");
  });
});

describe("mapApolloRow — number coercion", () => {
  it("coerces empty to null", () => {
    const out = mapApolloRow(row({ "# Employees": "" }));
    expect(out.employees).toBeNull();
  });

  it("coerces valid integer strings", () => {
    const out = mapApolloRow(row({ "# Employees": "68000" }));
    expect(out.employees).toBe(68000);
  });

  it("strips comma thousands separators", () => {
    const out = mapApolloRow(row({ "Annual Revenue": "21,046,345,000" }));
    expect(out.annual_revenue).toBe(21046345000);
  });

  it("returns null for non-numeric values", () => {
    const out = mapApolloRow(row({ "# Employees": "many" }));
    expect(out.employees).toBeNull();
  });

  it("handles bigint-range values", () => {
    const out = mapApolloRow(row({ "Total Funding": "5106000000" }));
    expect(out.total_funding).toBe(5106000000);
  });

  it("coerces score floats", () => {
    const out = mapApolloRow(row({ "Primary Intent Score": "0.75" }));
    expect(out.primary_intent_score).toBe(0.75);
  });
});

describe("mapApolloRow — array splits", () => {
  it("returns [] for empty Keywords", () => {
    expect(mapApolloRow(row({ Keywords: "" })).keywords).toEqual([]);
  });

  it("returns [] for missing Keywords column", () => {
    expect(mapApolloRow(row()).keywords).toEqual([]);
  });

  it("splits single keyword", () => {
    expect(mapApolloRow(row({ Keywords: "healthcare" })).keywords).toEqual([
      "healthcare",
    ]);
  });

  it("splits multiple keywords and trims whitespace", () => {
    const out = mapApolloRow(
      row({ Keywords: "healthcare, medical devices ,  lighting" }),
    );
    expect(out.keywords).toEqual(["healthcare", "medical devices", "lighting"]);
  });

  it("filters out empty entries", () => {
    expect(mapApolloRow(row({ Keywords: "a,,b, ,c" })).keywords).toEqual([
      "a",
      "b",
      "c",
    ]);
  });

  it("splits Technologies, SIC Codes, NAICS Codes the same way", () => {
    const out = mapApolloRow(
      row({
        Technologies: "Slack, Salesforce",
        "SIC Codes": "3829",
        "NAICS Codes": "33911, 33912",
      }),
    );
    expect(out.technologies).toEqual(["Slack", "Salesforce"]);
    expect(out.sic_codes).toEqual(["3829"]);
    expect(out.naics_codes).toEqual(["33911", "33912"]);
  });
});

describe("mapApolloRow — date parsing", () => {
  it("returns YYYY-MM-DD verbatim", () => {
    expect(
      mapApolloRow(row({ "Last Raised At": "2024-07-01" })).last_raised_at,
    ).toBe("2024-07-01");
  });

  it("truncates ISO timestamps to date", () => {
    expect(
      mapApolloRow(row({ "Last Raised At": "2024-07-01T12:34:56Z" }))
        .last_raised_at,
    ).toBe("2024-07-01");
  });

  it("returns null for malformed dates", () => {
    expect(
      mapApolloRow(row({ "Last Raised At": "Q3 2024" })).last_raised_at,
    ).toBeNull();
  });

  it("returns null for empty", () => {
    expect(
      mapApolloRow(row({ "Last Raised At": "" })).last_raised_at,
    ).toBeNull();
  });
});

describe("mapApolloRow — apollo_custom jsonb", () => {
  it("collects all four workflow columns by literal header name", () => {
    const out = mapApolloRow(
      row({
        "Qualify Account": "yes",
        "Prerequisite: Research Target Company": "done",
        "Prerequisite: Determine Research Guidelines": "pending",
        "Exhibitor Likelihood 9370 0420125559": "high",
      }),
    );
    expect(out.apollo_custom).toEqual({
      "Qualify Account": "yes",
      "Prerequisite: Research Target Company": "done",
      "Prerequisite: Determine Research Guidelines": "pending",
      "Exhibitor Likelihood 9370 0420125559": "high",
    });
  });

  it("preserves dynamic Exhibitor Likelihood key with different IDs", () => {
    const out = mapApolloRow(
      row({ "Exhibitor Likelihood 1234 5678": "medium" }),
    );
    expect(out.apollo_custom["Exhibitor Likelihood 1234 5678"]).toBe("medium");
  });

  it("omits empty workflow values", () => {
    const out = mapApolloRow(row({ "Qualify Account": "" }));
    expect(out.apollo_custom).toEqual({});
  });

  it("does not include non-workflow columns", () => {
    const out = mapApolloRow(
      row({ Industry: "tech", "Qualify Account": "yes" }),
    );
    expect(Object.keys(out.apollo_custom)).toEqual(["Qualify Account"]);
  });
});

describe("mapApolloRow — text field handling", () => {
  it("trims and nulls empty strings", () => {
    const out = mapApolloRow(row({ Industry: "  " }));
    expect(out.industry).toBeNull();
  });

  it("trims surrounding whitespace from values", () => {
    const out = mapApolloRow(row({ Industry: "  hospital & health care  " }));
    expect(out.industry).toBe("hospital & health care");
  });

  it("populates the full Signify-shaped row", () => {
    const out = mapApolloRow({
      "Company Name": "Signify",
      "Apollo Account Id": FIXED_ID,
      "Account Stage": "Cold",
      "# Employees": "68000",
      Industry: "hospital & health care",
      Website: "http://www.philips.com",
      "Company Country": "Netherlands",
      "Total Funding": "5106000000",
      "Annual Revenue": "21046345000",
      "Last Raised At": "2024-07-01",
      "SIC Codes": "3829",
      "NAICS Codes": "33911",
      "Founded Year": "1891",
    });
    expect(out.name).toBe("Signify");
    expect(out.country).toBe("Netherlands");
    expect(out.industry).toBe("hospital & health care");
    expect(out.employees).toBe(68000);
    expect(out.total_funding).toBe(5106000000);
    expect(out.annual_revenue).toBe(21046345000);
    expect(out.founded_year).toBe(1891);
    expect(out.last_raised_at).toBe("2024-07-01");
    expect(out.sic_codes).toEqual(["3829"]);
    expect(out.naics_codes).toEqual(["33911"]);
  });
});
