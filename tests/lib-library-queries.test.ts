import { describe, expect, it } from "vitest";
import {
  dedupeForSave,
  groupCrossEventCompanies,
  joinEventExhibitors,
  parseTagInput,
  tagsByName,
} from "../lib/library/queries";

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
        name_normalized: "acennv",
        country: "",
        hall: "",
        booth: null,
        employees: null,
        industry: null,
        annual_revenue: null,
        apollo_matched: false,
        tag: null,
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
          annual_revenue: null,
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
          annual_revenue: null,
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
          annual_revenue: null,
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
          annual_revenue: null,
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

describe("groupCrossEventCompanies", () => {
  const events = [
    { id: "e1", slug: "show-a", name: "Show A", year: 2025 },
    { id: "e2", slug: "show-b", name: "Show B", year: 2026 },
    { id: "e3", slug: "show-c", name: "Show C", year: 2026 },
  ];

  it("returns [] when no inputs", () => {
    expect(groupCrossEventCompanies([], [], [])).toEqual([]);
  });

  it("filters out companies appearing at only one event", () => {
    const result = groupCrossEventCompanies(
      [
        {
          raw_name: "Solo Co",
          country: null,
          hall: null,
          booth: null,
          name_normalized: "soloco",
          event_id: "e1",
        },
      ],
      events,
      [],
    );
    expect(result).toEqual([]);
  });

  it("includes companies appearing at 2+ events", () => {
    const result = groupCrossEventCompanies(
      [
        {
          raw_name: "Acme",
          country: "US",
          hall: null,
          booth: null,
          name_normalized: "acme",
          event_id: "e1",
        },
        {
          raw_name: "Acme Inc",
          country: null,
          hall: null,
          booth: null,
          name_normalized: "acme",
          event_id: "e2",
        },
      ],
      events,
      [],
    );
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      name_normalized: "acme",
      display_name: "Acme",
      country: "US",
      apollo_matched: false,
    });
    expect(result[0]?.events.map((e) => e.id)).toEqual(["e2", "e1"]);
  });

  it("populates Apollo enrichment when matched", () => {
    const result = groupCrossEventCompanies(
      [
        {
          raw_name: "Signify",
          country: null,
          hall: null,
          booth: null,
          name_normalized: "signify",
          event_id: "e1",
        },
        {
          raw_name: "Signify",
          country: null,
          hall: null,
          booth: null,
          name_normalized: "signify",
          event_id: "e2",
        },
      ],
      events,
      [
        {
          name_normalized: "signify",
          country: "Netherlands",
          employees: 68000,
          industry: "lighting",
          annual_revenue: null,
        },
      ],
    );
    expect(result[0]).toMatchObject({
      country: "Netherlands",
      employees: 68000,
      industry: "lighting",
      apollo_matched: true,
    });
  });

  it("ee.country wins over Apollo when both present", () => {
    const result = groupCrossEventCompanies(
      [
        {
          raw_name: "Acme",
          country: "DE",
          hall: null,
          booth: null,
          name_normalized: "acme",
          event_id: "e1",
        },
        {
          raw_name: "Acme",
          country: null,
          hall: null,
          booth: null,
          name_normalized: "acme",
          event_id: "e2",
        },
      ],
      events,
      [
        {
          name_normalized: "acme",
          country: "US",
          employees: null,
          industry: null,
          annual_revenue: null,
        },
      ],
    );
    expect(result[0]?.country).toBe("DE");
  });

  it("sorts by event count desc then by display_name asc", () => {
    const result = groupCrossEventCompanies(
      [
        // Bravo: 2 events
        { raw_name: "Bravo", country: null, hall: null, booth: null, name_normalized: "bravo", event_id: "e1" },
        { raw_name: "Bravo", country: null, hall: null, booth: null, name_normalized: "bravo", event_id: "e2" },
        // Alpha: 3 events
        { raw_name: "Alpha", country: null, hall: null, booth: null, name_normalized: "alpha", event_id: "e1" },
        { raw_name: "Alpha", country: null, hall: null, booth: null, name_normalized: "alpha", event_id: "e2" },
        { raw_name: "Alpha", country: null, hall: null, booth: null, name_normalized: "alpha", event_id: "e3" },
        // Charlie: 2 events
        { raw_name: "Charlie", country: null, hall: null, booth: null, name_normalized: "charlie", event_id: "e1" },
        { raw_name: "Charlie", country: null, hall: null, booth: null, name_normalized: "charlie", event_id: "e3" },
      ],
      events,
      [],
    );
    expect(result.map((r) => r.display_name)).toEqual([
      "Alpha",
      "Bravo",
      "Charlie",
    ]);
  });
});

describe("tagsByName", () => {
  it("returns empty map for empty input", () => {
    expect(tagsByName([]).size).toBe(0);
  });

  it("indexes tags by name_normalized", () => {
    const m = tagsByName([
      { name_normalized: "acme", tag: "customer" },
      { name_normalized: "signify", tag: "prospect" },
    ]);
    expect(m.get("acme")).toBe("customer");
    expect(m.get("signify")).toBe("prospect");
    expect(m.get("missing")).toBeUndefined();
  });
});

describe("joinEventExhibitors with tags", () => {
  it("populates tag from company_tags when present", () => {
    const result = joinEventExhibitors(
      [
        {
          raw_name: "Acme",
          country: null,
          hall: null,
          booth: null,
          name_normalized: "acme",
        },
      ],
      [],
      [{ name_normalized: "acme", tag: "customer" }],
    );
    expect(result[0]?.tag).toBe("customer");
  });

  it("tag is null when no matching company_tags row", () => {
    const result = joinEventExhibitors(
      [
        {
          raw_name: "Acme",
          country: null,
          hall: null,
          booth: null,
          name_normalized: "acme",
        },
      ],
      [],
      [{ name_normalized: "other", tag: "won" }],
    );
    expect(result[0]?.tag).toBeNull();
  });
});

describe("groupCrossEventCompanies with tags", () => {
  const events = [
    { id: "e1", slug: "show-a", name: "Show A", year: 2025 },
    { id: "e2", slug: "show-b", name: "Show B", year: 2026 },
  ];

  it("populates tag on cross-event rows when present", () => {
    const result = groupCrossEventCompanies(
      [
        { raw_name: "Acme", country: null, hall: null, booth: null, name_normalized: "acme", event_id: "e1" },
        { raw_name: "Acme", country: null, hall: null, booth: null, name_normalized: "acme", event_id: "e2" },
      ],
      events,
      [],
      [{ name_normalized: "acme", tag: "won" }],
    );
    expect(result[0]?.tag).toBe("won");
  });
});

describe("dedupeForSave", () => {
  it("normalizes raw_name and dedupes by name_normalized", () => {
    const result = dedupeForSave([
      { raw_name: "Acme Corp", country: "US", hall: null, booth: null },
      { raw_name: "ACME CORP!", country: "US", hall: null, booth: null },
      { raw_name: "Beta Ltd", country: "UK", hall: null, booth: null },
    ]);
    expect(result.dupes).toBe(1);
    expect(result.rows.map((r) => r.name_normalized)).toEqual([
      "acmecorp",
      "betaltd",
    ]);
  });

  it("trims whitespace and skips rows with raw_name length < 2", () => {
    const result = dedupeForSave([
      { raw_name: "  X  ", country: null, hall: null, booth: null },
      { raw_name: "  Real Co  ", country: null, hall: null, booth: null },
      { raw_name: "", country: null, hall: null, booth: null },
    ]);
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0]?.raw_name).toBe("Real Co");
  });

  it("returns no rows and no dupes for empty input", () => {
    expect(dedupeForSave([])).toEqual({ rows: [], dupes: 0 });
  });

  it("preserves country/hall/booth on the deduped row", () => {
    const result = dedupeForSave([
      { raw_name: "Acme", country: "US", hall: "1", booth: "A1" },
    ]);
    expect(result.rows[0]).toMatchObject({
      raw_name: "Acme",
      country: "US",
      hall: "1",
      booth: "A1",
      name_normalized: "acme",
    });
  });
});

describe("parseTagInput", () => {
  it("splits on newlines and commas, trims, and dedupes (case-insensitive)", () => {
    const out = parseTagInput("Acme Corp\nAcme Corp\nbeta ltd, Beta Ltd!\n  \n");
    expect(out).toEqual(["Acme Corp", "beta ltd"]);
  });

  it("ignores entries shorter than 2 chars", () => {
    expect(parseTagInput("a\nbb\nccc")).toEqual(["bb", "ccc"]);
  });

  it("ignores entries that normalize to empty (pure punctuation)", () => {
    expect(parseTagInput("---\n!!!\nReal Co")).toEqual(["Real Co"]);
  });

  it("returns [] for empty input", () => {
    expect(parseTagInput("")).toEqual([]);
    expect(parseTagInput("   \n\t\n")).toEqual([]);
  });
});
