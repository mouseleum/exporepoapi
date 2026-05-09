"use client";

import type { LibraryExhibitor, TagValue } from "@/lib/library/queries";
import { formatRevenueUsd } from "@/lib/library/format";
import { TagPicker } from "./TagPicker";

type ExhibitorPreviewProps = {
  exhibitors: LibraryExhibitor[];
  visible?: LibraryExhibitor[];
  onTagChange?: (name_normalized: string, tag: TagValue | null) => void;
  onEdit?: (exhibitor: LibraryExhibitor) => void;
  filterChildren?: React.ReactNode;
};

function formatEmployees(n: number | null): string {
  if (n === null) return "—";
  return n.toLocaleString();
}

function sourceLabel(row: LibraryExhibitor): string {
  if (row.source === "manual") return "manual";
  if (row.apollo_matched) return "enriched";
  return "—";
}

export function ExhibitorPreview({
  exhibitors,
  visible,
  onTagChange,
  onEdit,
  filterChildren,
}: ExhibitorPreviewProps) {
  const total = exhibitors.length;
  const matched = exhibitors.filter((e) => e.apollo_matched).length;
  const rows = visible ?? exhibitors;
  const filtered = rows.length !== total;

  return (
    <div className="exhibitor-preview">
      <div className="exhibitor-preview-header">
        <span className="exhibitor-preview-title">Exhibitors</span>
        <span className="exhibitor-preview-count">
          {filtered ? `${rows.length} of ${total} · ` : ""}
          {matched} / {total} enriched
        </span>
      </div>
      {filterChildren}
      {rows.length === 0 ? (
        <div className="empty-state">No exhibitors match the current filter.</div>
      ) : (
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Name</th>
              <th>Country</th>
              <th>Hall</th>
              <th>Booth</th>
              <th>Employees</th>
              <th>Revenue</th>
              <th>Industry</th>
              <th>Source</th>
              <th>Tag</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.name_normalized}>
                <td className="company-cell">
                  <span className="company-name-wrap">
                    <span>{row.raw_name}</span>
                    {row.source === "manual" && (
                      <span className="tag-manual">manual</span>
                    )}
                    {onEdit && (
                      <button
                        type="button"
                        className="edit-btn"
                        aria-label={`Edit ${row.raw_name}`}
                        onClick={() => onEdit(row)}
                      >
                        <svg
                          width="12"
                          height="12"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                        >
                          <path d="M12 20h9" />
                          <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5z" />
                        </svg>
                      </button>
                    )}
                  </span>
                </td>
                <td className="country-cell">{row.country || "—"}</td>
                <td className="hall-cell">{row.hall || "—"}</td>
                <td className="hall-cell">{row.booth ?? "—"}</td>
                <td className="country-cell">
                  {formatEmployees(row.employees)}
                </td>
                <td className="country-cell">
                  {formatRevenueUsd(row.annual_revenue) ?? "—"}
                </td>
                <td className="industry-cell">{row.industry ?? "—"}</td>
                <td className="hall-cell">{sourceLabel(row)}</td>
                <td>
                  <TagPicker
                    value={row.tag}
                    onChange={(tag) =>
                      onTagChange?.(row.name_normalized, tag)
                    }
                    disabled={!onTagChange}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      )}
    </div>
  );
}
