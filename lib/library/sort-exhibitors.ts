import type { LibraryExhibitor } from "./queries";

export type ExhibitorSortKey =
  | "name"
  | "country"
  | "hall"
  | "booth"
  | "employees"
  | "revenue"
  | "industry"
  | "source"
  | "tag";

export type SortDir = "asc" | "desc";

export type ExhibitorSort = { key: ExhibitorSortKey; dir: SortDir };

function sourceRank(row: LibraryExhibitor): string {
  if (row.source === "manual") return "manual";
  if (row.apollo_matched) return "enriched";
  return "";
}

function valueOf(
  row: LibraryExhibitor,
  key: ExhibitorSortKey,
): string | number | null {
  switch (key) {
    case "name":
      return row.raw_name;
    case "country":
      return row.country;
    case "hall":
      return row.hall;
    case "booth":
      return row.booth;
    case "employees":
      return row.employees;
    case "revenue":
      return row.annual_revenue;
    case "industry":
      return row.industry;
    case "source":
      return sourceRank(row);
    case "tag":
      return row.tag;
  }
}

function isEmpty(v: string | number | null): boolean {
  return v === null || v === undefined || v === "";
}

// Sorts a copy of `rows`. Empty / null values always sink to the bottom
// regardless of direction, so toggling asc/desc never floats blanks to the
// top. Array.prototype.sort is stable, so equal rows keep their input order.
export function sortExhibitors(
  rows: LibraryExhibitor[],
  sort: ExhibitorSort,
): LibraryExhibitor[] {
  const factor = sort.dir === "asc" ? 1 : -1;
  return [...rows].sort((ra, rb) => {
    const a = valueOf(ra, sort.key);
    const b = valueOf(rb, sort.key);
    const aEmpty = isEmpty(a);
    const bEmpty = isEmpty(b);
    if (aEmpty && bEmpty) return 0;
    if (aEmpty) return 1;
    if (bEmpty) return -1;
    if (typeof a === "number" && typeof b === "number") {
      return (a - b) * factor;
    }
    return (
      String(a).localeCompare(String(b), undefined, { sensitivity: "base" }) *
      factor
    );
  });
}

// Click cycle for a column header: a fresh column starts ascending; clicking
// the active column flips the direction.
export function nextSort(
  current: ExhibitorSort | null,
  key: ExhibitorSortKey,
): ExhibitorSort {
  if (current && current.key === key) {
    return { key, dir: current.dir === "asc" ? "desc" : "asc" };
  }
  return { key, dir: "asc" };
}
