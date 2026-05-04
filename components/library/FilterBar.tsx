"use client";

import {
  FILTER_TAGS,
  type FilterState,
  type FilterTag,
} from "@/lib/library/filters";

type FilterBarProps = {
  filter: FilterState;
  counts: Record<FilterTag, number>;
  onChange: (next: FilterState) => void;
  searchPlaceholder?: string;
};

export function FilterBar({
  filter,
  counts,
  onChange,
  searchPlaceholder = "Search by name…",
}: FilterBarProps) {
  return (
    <div className="filter-bar">
      <div className="bulk-tag-filters">
        {FILTER_TAGS.map((t) => (
          <button
            key={t}
            type="button"
            className={`bulk-tag-filter${filter.tag === t ? " active" : ""} bulk-tag-filter-${t}`}
            onClick={() => onChange({ ...filter, tag: t })}
          >
            {t} <span className="bulk-tag-filter-count">{counts[t]}</span>
          </button>
        ))}
      </div>
      <input
        type="search"
        className="filter-search"
        placeholder={searchPlaceholder}
        value={filter.search}
        onChange={(e) => onChange({ ...filter, search: e.target.value })}
      />
    </div>
  );
}
