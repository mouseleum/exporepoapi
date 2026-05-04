"use client";

import type { LibraryExhibitor, TagValue } from "@/lib/library/queries";
import { TagPicker } from "./TagPicker";

type ExhibitorPreviewProps = {
  exhibitors: LibraryExhibitor[];
  visible?: LibraryExhibitor[];
  onTagChange?: (name_normalized: string, tag: TagValue | null) => void;
  filterChildren?: React.ReactNode;
};

function formatEmployees(n: number | null): string {
  if (n === null) return "—";
  return n.toLocaleString();
}

export function ExhibitorPreview({
  exhibitors,
  visible,
  onTagChange,
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
          {matched} / {total} enriched from Apollo
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
              <th>Industry</th>
              <th>Source</th>
              <th>Tag</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.name_normalized}>
                <td className="company-cell">{row.raw_name}</td>
                <td className="country-cell">{row.country || "—"}</td>
                <td className="hall-cell">{row.hall || "—"}</td>
                <td className="hall-cell">{row.booth ?? "—"}</td>
                <td className="country-cell">
                  {formatEmployees(row.employees)}
                </td>
                <td className="industry-cell">{row.industry ?? "—"}</td>
                <td className="hall-cell">
                  {row.apollo_matched ? "apollo" : "—"}
                </td>
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
