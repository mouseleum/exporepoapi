import { describe, it, expect } from "vitest";
import { guessCol, guessAllColumns } from "@/lib/columns";

describe("guessCol", () => {
  it("returns the matching header for a candidate keyword", () => {
    expect(guessCol(["Company", "Country", "Hall"], ["company"])).toBe(
      "Company",
    );
  });

  it("is case-insensitive", () => {
    expect(guessCol(["COMPANY NAME"], ["company"])).toBe("COMPANY NAME");
  });

  it("ignores spaces, dashes and underscores when matching", () => {
    expect(guessCol(["Exhibitor Name"], ["exhibitorname"])).toBe(
      "Exhibitor Name",
    );
    expect(guessCol(["company-name"], ["companyname"])).toBe("company-name");
    expect(guessCol(["company_name"], ["companyname"])).toBe("company_name");
  });

  it("respects candidate priority order", () => {
    const headers = ["Organisation", "Company"];
    expect(guessCol(headers, ["company", "organisation"])).toBe("Company");
  });

  it("returns empty string when nothing matches", () => {
    expect(guessCol(["foo", "bar"], ["company"])).toBe("");
  });
});

describe("guessAllColumns", () => {
  it("guesses name, country, hall from typical headers", () => {
    expect(
      guessAllColumns(["Company", "Country", "Hall"]),
    ).toEqual({
      name: "Company",
      country: "Country",
      hall: "Hall",
    });
  });

  it("returns empty strings for missing columns", () => {
    expect(guessAllColumns(["foo", "bar"])).toEqual({
      name: "",
      country: "",
      hall: "",
    });
  });
});
