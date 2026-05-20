import { describe, expect, it } from "vitest";
import {
  nextSort,
  sortExhibitors,
  type ExhibitorSort,
} from "../lib/library/sort-exhibitors";
import type { LibraryExhibitor } from "../lib/library/queries";

const ex = (over: Partial<LibraryExhibitor>): LibraryExhibitor => ({
  raw_name: "Acme",
  name_normalized: "acme",
  country: "Germany",
  hall: "C4",
  booth: "C4.100",
  employees: 100,
  industry: "Manufacturing",
  annual_revenue: 1_000_000,
  apollo_matched: true,
  source: null,
  tag: null,
  ...over,
});

const names = (rows: LibraryExhibitor[]) => rows.map((r) => r.raw_name);

describe("sortExhibitors", () => {
  it("sorts strings case-insensitively ascending", () => {
    const rows = [
      ex({ raw_name: "zeta" }),
      ex({ raw_name: "Alpha" }),
      ex({ raw_name: "beta" }),
    ];
    expect(names(sortExhibitors(rows, { key: "name", dir: "asc" }))).toEqual([
      "Alpha",
      "beta",
      "zeta",
    ]);
  });

  it("sorts strings descending", () => {
    const rows = [
      ex({ raw_name: "Alpha" }),
      ex({ raw_name: "zeta" }),
      ex({ raw_name: "beta" }),
    ];
    expect(names(sortExhibitors(rows, { key: "name", dir: "desc" }))).toEqual([
      "zeta",
      "beta",
      "Alpha",
    ]);
  });

  it("sorts numeric columns numerically, not lexically", () => {
    const rows = [
      ex({ raw_name: "a", employees: 9 }),
      ex({ raw_name: "b", employees: 100 }),
      ex({ raw_name: "c", employees: 20 }),
    ];
    expect(names(sortExhibitors(rows, { key: "employees", dir: "asc" }))).toEqual(
      ["a", "c", "b"],
    );
  });

  it("sorts revenue by the raw number", () => {
    const rows = [
      ex({ raw_name: "a", annual_revenue: 5_000_000 }),
      ex({ raw_name: "b", annual_revenue: 250_000 }),
      ex({ raw_name: "c", annual_revenue: 80_000_000 }),
    ];
    expect(names(sortExhibitors(rows, { key: "revenue", dir: "desc" }))).toEqual(
      ["c", "a", "b"],
    );
  });

  it("sinks null numeric values to the bottom on ascending sort", () => {
    const rows = [
      ex({ raw_name: "a", employees: null }),
      ex({ raw_name: "b", employees: 50 }),
      ex({ raw_name: "c", employees: 10 }),
    ];
    expect(names(sortExhibitors(rows, { key: "employees", dir: "asc" }))).toEqual(
      ["c", "b", "a"],
    );
  });

  it("keeps null numeric values at the bottom on descending sort too", () => {
    const rows = [
      ex({ raw_name: "a", employees: null }),
      ex({ raw_name: "b", employees: 50 }),
      ex({ raw_name: "c", employees: 10 }),
    ];
    expect(
      names(sortExhibitors(rows, { key: "employees", dir: "desc" })),
    ).toEqual(["b", "c", "a"]);
  });

  it("sinks empty strings to the bottom regardless of direction", () => {
    const rows = [
      ex({ raw_name: "a", country: "" }),
      ex({ raw_name: "b", country: "Spain" }),
      ex({ raw_name: "c", country: "Italy" }),
    ];
    expect(names(sortExhibitors(rows, { key: "country", dir: "asc" }))).toEqual(
      ["c", "b", "a"],
    );
    expect(names(sortExhibitors(rows, { key: "country", dir: "desc" }))).toEqual(
      ["b", "c", "a"],
    );
  });

  it("sorts the source column by enriched/manual label", () => {
    const rows = [
      ex({ raw_name: "plain", apollo_matched: false, source: null }),
      ex({ raw_name: "man", apollo_matched: false, source: "manual" }),
      ex({ raw_name: "enr", apollo_matched: true, source: null }),
    ];
    // labels: "" (plain), "manual", "enriched" → asc puts "" last
    expect(names(sortExhibitors(rows, { key: "source", dir: "asc" }))).toEqual([
      "enr",
      "man",
      "plain",
    ]);
  });

  it("treats null tags as empty and sinks them", () => {
    const rows = [
      ex({ raw_name: "a", tag: null }),
      ex({ raw_name: "b", tag: "won" }),
      ex({ raw_name: "c", tag: "customer" }),
    ];
    expect(names(sortExhibitors(rows, { key: "tag", dir: "asc" }))).toEqual([
      "c",
      "b",
      "a",
    ]);
  });

  it("is stable for equal values (input order preserved)", () => {
    const rows = [
      ex({ raw_name: "first", country: "Germany" }),
      ex({ raw_name: "second", country: "Germany" }),
      ex({ raw_name: "third", country: "Germany" }),
    ];
    expect(names(sortExhibitors(rows, { key: "country", dir: "asc" }))).toEqual([
      "first",
      "second",
      "third",
    ]);
  });

  it("does not mutate the input array", () => {
    const rows = [ex({ raw_name: "b" }), ex({ raw_name: "a" })];
    const before = names(rows);
    sortExhibitors(rows, { key: "name", dir: "asc" });
    expect(names(rows)).toEqual(before);
  });
});

describe("nextSort", () => {
  it("starts a fresh column ascending", () => {
    expect(nextSort(null, "country")).toEqual({ key: "country", dir: "asc" });
  });

  it("starts a different column ascending even if another was active", () => {
    const current: ExhibitorSort = { key: "name", dir: "desc" };
    expect(nextSort(current, "employees")).toEqual({
      key: "employees",
      dir: "asc",
    });
  });

  it("flips direction when the same column is clicked again", () => {
    expect(nextSort({ key: "name", dir: "asc" }, "name")).toEqual({
      key: "name",
      dir: "desc",
    });
    expect(nextSort({ key: "name", dir: "desc" }, "name")).toEqual({
      key: "name",
      dir: "asc",
    });
  });
});
