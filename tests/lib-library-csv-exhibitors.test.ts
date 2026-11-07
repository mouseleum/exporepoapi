import { describe, expect, it } from "vitest";
import { csvToExhibitors } from "../lib/library/csv-exhibitors";
import { guessExhibitorColumns } from "../lib/columns";

describe("guessExhibitorColumns", () => {
  it("picks name, country, hall and booth as separate columns", () => {
    const cols = guessExhibitorColumns(["Company", "Country", "Hall", "Booth"]);
    expect(cols).toEqual({
      name: "Company",
      country: "Country",
      hall: "Hall",
      booth: "Booth",
    });
  });

  it("treats a combined Hall/Booth column as the booth, not both", () => {
    // Writing the same string into both DB columns would be worse than
    // leaving hall empty.
    const cols = guessExhibitorColumns(["Exhibitor", "Hall/Booth"]);
    expect(cols.booth).toBe("Hall/Booth");
    expect(cols.hall).toBe("");
  });

  it("matches headers case- and separator-insensitively", () => {
    const cols = guessExhibitorColumns(["EXHIBITOR_NAME", "stand number"]);
    expect(cols.name).toBe("EXHIBITOR_NAME");
    expect(cols.booth).toBe("stand number");
  });

  it("leaves optional columns empty when absent", () => {
    const cols = guessExhibitorColumns(["Company"]);
    expect(cols).toEqual({ name: "Company", country: "", hall: "", booth: "" });
  });
});

describe("csvToExhibitors", () => {
  it("maps a semicolon CSV, which is what European fairs export", () => {
    const csv = "Company;Country;Hall\nAcme GmbH;Germany;3\nBeta SA;France;1";
    const { rows, columns } = csvToExhibitors(csv);
    expect(columns.name).toBe("Company");
    expect(rows).toEqual([
      { raw_name: "Acme GmbH", country: "Germany", hall: "3", booth: null, source_id: null },
      { raw_name: "Beta SA", country: "France", hall: "1", booth: null, source_id: null },
    ]);
  });

  it("turns blank cells into null rather than empty strings", () => {
    const { rows } = csvToExhibitors("Company,Country\nAcme,\n");
    expect(rows[0]?.country).toBeNull();
  });

  it("counts rows with no usable name instead of silently dropping them", () => {
    const csv = "Company,Country\nAcme,DE\n,FR\nX,IT\nBeta,ES";
    const { rows, skippedNoName } = csvToExhibitors(csv);
    expect(rows.map((r) => r.raw_name)).toEqual(["Acme", "Beta"]);
    expect(skippedNoName).toBe(2); // the empty one and the single character
  });

  it("throws a listing of the headers when no name column is found", () => {
    expect(() => csvToExhibitors("Foo,Bar\n1,2")).toThrow(/Headers found: Foo, Bar/);
  });

  it("returns empty for an empty CSV rather than throwing", () => {
    expect(csvToExhibitors("").rows).toEqual([]);
  });

  it("keeps quoted commas inside a company name", () => {
    const { rows } = csvToExhibitors('Company,Country\n"Acme, Inc.",US');
    expect(rows[0]?.raw_name).toBe("Acme, Inc.");
  });
});
