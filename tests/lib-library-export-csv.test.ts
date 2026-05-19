import { describe, expect, it } from "vitest";
import { buildExhibitorsCsv } from "../lib/library/export-csv";
import type { LibraryExhibitor } from "../lib/library/queries";

const row = (over: Partial<LibraryExhibitor> = {}): LibraryExhibitor => ({
  raw_name: "Acme Corp",
  name_normalized: "acme corp",
  country: "Germany",
  hall: "C4",
  booth: "C4.280G",
  employees: 1200,
  industry: "Manufacturing",
  annual_revenue: 250_000_000,
  apollo_matched: true,
  source: null,
  tag: null,
  ...over,
});

describe("buildExhibitorsCsv", () => {
  it("renders the canonical column header", () => {
    expect(buildExhibitorsCsv([]).split("\n")[0]).toBe(
      "Name,Country,Hall,Booth,Employees,Revenue,Industry,Source,Tag",
    );
  });

  it("returns just the header when there are no rows", () => {
    expect(buildExhibitorsCsv([])).toBe(
      "Name,Country,Hall,Booth,Employees,Revenue,Industry,Source,Tag\n",
    );
  });

  it("emits one row per exhibitor with apollo→enriched label and revenue formatting", () => {
    const csv = buildExhibitorsCsv([row()]);
    const lines = csv.split("\n");
    expect(lines[1]).toBe(
      '"Acme Corp","Germany","C4","C4.280G","1200","$250M","Manufacturing","enriched",""',
    );
  });

  it("renders manual rows with source=manual", () => {
    const csv = buildExhibitorsCsv([
      row({ source: "manual", apollo_matched: false }),
    ]);
    expect(csv).toMatch(/"manual",""$/m);
  });

  it("blanks the source field for unmatched, non-manual rows", () => {
    const csv = buildExhibitorsCsv([
      row({
        apollo_matched: false,
        employees: null,
        industry: null,
        annual_revenue: null,
      }),
    ]);
    expect(csv).toMatch(
      /"Acme Corp","Germany","C4","C4.280G","","","","",""$/m,
    );
  });

  it("escapes embedded quotes and neutralizes CSV-injection prefixes", () => {
    const csv = buildExhibitorsCsv([
      row({ raw_name: '=SUM(A1)', industry: 'Foo "Bar" Baz' }),
    ]);
    // = → '= (Excel formula neutralisation), " → "" inside the quoted field
    expect(csv).toContain(`"'=SUM(A1)"`);
    expect(csv).toContain(`"Foo ""Bar"" Baz"`);
  });

  it("includes the tag value when set", () => {
    const csv = buildExhibitorsCsv([row({ tag: "customer" })]);
    expect(csv).toMatch(/,"customer"$/m);
  });

  it("ends with a trailing newline so editors don't mangle the last row", () => {
    expect(buildExhibitorsCsv([row()]).endsWith("\n")).toBe(true);
  });
});
