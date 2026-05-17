import { describe, expect, it } from "vitest";
import { csvEscape } from "../lib/csv-escape";

describe("csvEscape", () => {
  it("returns empty string for null and undefined", () => {
    expect(csvEscape(null)).toBe("");
    expect(csvEscape(undefined)).toBe("");
  });

  it("stringifies numbers as-is", () => {
    expect(csvEscape(42)).toBe("42");
    expect(csvEscape(0)).toBe("0");
  });

  it("passes simple strings through unchanged", () => {
    expect(csvEscape("Acme Inc")).toBe("Acme Inc");
    expect(csvEscape("hello, world")).toBe("hello, world"); // comma is fine inside quoted field
  });

  it("doubles internal double quotes", () => {
    expect(csvEscape(`ACME "Nordic", Oy`)).toBe(`ACME ""Nordic"", Oy`);
    expect(csvEscape(`"`)).toBe(`""`);
  });

  it("preserves newlines inside quoted fields", () => {
    expect(csvEscape("line one\nline two")).toBe("line one\nline two");
  });

  it("neutralizes formula prefixes (=, +, -, @)", () => {
    expect(csvEscape("=HYPERLINK(\"x\")")).toBe(`'=HYPERLINK(""x"")`);
    expect(csvEscape("+1234")).toBe("'+1234");
    expect(csvEscape("-SUM(A1)")).toBe("'-SUM(A1)");
    expect(csvEscape("@hello")).toBe("'@hello");
  });

  it("does NOT neutralize leading non-formula chars", () => {
    expect(csvEscape("hello")).toBe("hello");
    expect(csvEscape("1+1=2")).toBe("1+1=2"); // = not at start → safe
  });
});
