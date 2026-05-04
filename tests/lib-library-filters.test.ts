import { describe, expect, it } from "vitest";
import { applyFilter, type FilterState } from "../lib/library/filters";
import type { TagValue } from "../lib/library/queries";

type Row = {
  name: string;
  tag: TagValue | null;
  searchText: string;
};

const rows: Row[] = [
  { name: "Acme", tag: "customer", searchText: "Acme NL infosec" },
  { name: "Beta", tag: null, searchText: "Beta Industries DE manufacturing" },
  { name: "Cog", tag: "prospect", searchText: "Cog AG CH analytics" },
  { name: "Doom", tag: "won", searchText: "Doom Co US" },
  { name: "Edge", tag: null, searchText: "Edge Labs UK" },
  { name: "Fox", tag: "lost", searchText: "Fox Holdings IT" },
];

const extract = (r: Row) => ({ tag: r.tag, searchText: r.searchText });

const f = (tag: FilterState["tag"], search = ""): FilterState => ({
  tag,
  search,
});

describe("applyFilter", () => {
  it("returns input unchanged when tag=all and search is empty", () => {
    const result = applyFilter(rows, f("all"), extract);
    expect(result).toBe(rows);
  });

  it("treats whitespace-only search as empty", () => {
    const result = applyFilter(rows, f("all", "   "), extract);
    expect(result).toBe(rows);
  });

  it("filters by tag=untagged (null tag only)", () => {
    const result = applyFilter(rows, f("untagged"), extract);
    expect(result.map((r) => r.name)).toEqual(["Beta", "Edge"]);
  });

  it("filters by a specific tag value", () => {
    const result = applyFilter(rows, f("customer"), extract);
    expect(result.map((r) => r.name)).toEqual(["Acme"]);
  });

  it("does case-insensitive substring search on searchText", () => {
    const result = applyFilter(rows, f("all", "INFO"), extract);
    expect(result.map((r) => r.name)).toEqual(["Acme"]);
  });

  it("ANDs tag and search filters together", () => {
    const result = applyFilter(rows, f("untagged", "uk"), extract);
    expect(result.map((r) => r.name)).toEqual(["Edge"]);
  });

  it("returns empty array when no rows match", () => {
    expect(applyFilter(rows, f("all", "no-such-thing"), extract)).toEqual([]);
    expect(applyFilter(rows, f("won", "infosec"), extract)).toEqual([]);
  });

  it("handles empty input", () => {
    expect(applyFilter([], f("all"), extract)).toEqual([]);
    expect(applyFilter([], f("customer", "x"), extract)).toEqual([]);
  });
});
