import { describe, it, expect } from "vitest";
import { parseCSV } from "@/lib/csv";

describe("parseCSV", () => {
  it("parses comma-delimited rows", () => {
    const text = "a,b,c\n1,2,3\n4,5,6";
    expect(parseCSV(text)).toEqual([
      { a: "1", b: "2", c: "3" },
      { a: "4", b: "5", c: "6" },
    ]);
  });

  it("auto-detects semicolon delimiter when more frequent on header line", () => {
    const text = "name;country;hall\nAcme;US;A1\nBeta;DE;B2";
    expect(parseCSV(text)).toEqual([
      { name: "Acme", country: "US", hall: "A1" },
      { name: "Beta", country: "DE", hall: "B2" },
    ]);
  });

  it("handles quoted fields containing the delimiter", () => {
    const text = 'name,note\nAcme,"hello, world"';
    expect(parseCSV(text)).toEqual([{ name: "Acme", note: "hello, world" }]);
  });

  it("handles escaped double quotes inside quoted fields", () => {
    const text = 'name,note\nAcme,"she said ""hi"""';
    expect(parseCSV(text)).toEqual([{ name: "Acme", note: 'she said "hi"' }]);
  });

  it("handles CRLF line endings", () => {
    const text = "a,b\r\n1,2\r\n3,4";
    expect(parseCSV(text)).toEqual([
      { a: "1", b: "2" },
      { a: "3", b: "4" },
    ]);
  });

  it("trims fields and skips empty trailing lines", () => {
    const text = "a,b\n 1 , 2 \n\n";
    expect(parseCSV(text)).toEqual([{ a: "1", b: "2" }]);
  });

  it("returns empty array for empty input", () => {
    expect(parseCSV("")).toEqual([]);
  });

  it("fills missing trailing fields with empty string", () => {
    const text = "a,b,c\n1,2";
    expect(parseCSV(text)).toEqual([{ a: "1", b: "2", c: "" }]);
  });
});
