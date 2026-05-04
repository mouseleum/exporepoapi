import type { TagValue } from "./queries";

export type FilterTag = TagValue | "all" | "untagged";

export type FilterState = {
  tag: FilterTag;
  search: string;
};

export const FILTER_TAGS: FilterTag[] = [
  "all",
  "untagged",
  "customer",
  "prospect",
  "won",
  "lost",
];

export type FilterableRow = {
  tag: TagValue | null;
  searchText: string;
};

export function applyFilter<T>(
  rows: T[],
  filter: FilterState,
  extract: (r: T) => FilterableRow,
): T[] {
  const q = filter.search.trim().toLowerCase();
  if (filter.tag === "all" && q.length === 0) return rows;
  return rows.filter((r) => {
    const f = extract(r);
    if (filter.tag === "untagged") {
      if (f.tag !== null) return false;
    } else if (filter.tag !== "all") {
      if (f.tag !== filter.tag) return false;
    }
    if (q.length > 0 && !f.searchText.toLowerCase().includes(q)) {
      return false;
    }
    return true;
  });
}
