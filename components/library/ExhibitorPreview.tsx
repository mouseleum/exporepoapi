"use client";

import type { LibraryExhibitor, TagValue } from "@/lib/library/queries";
import { TagPicker } from "./TagPicker";

type ExhibitorPreviewProps = {
  exhibitors: LibraryExhibitor[];
  onTagChange?: (name_normalized: string, tag: TagValue | null) => void;
};

const PREVIEW_LIMIT = 50;

function formatEmployees(n: number | null): string {
  if (n === null) return "—";
  return n.toLocaleString();
}

export function ExhibitorPreview({
  exhibitors,
  onTagChange,
}: ExhibitorPreviewProps) {
  const total = exhibitors.length;
  const matched = exhibitors.filter((e) => e.apollo_matched).length;
  const visible = exhibitors.slice(0, PREVIEW_LIMIT);
  const overflow = Math.max(0, total - visible.length);

  return (
    <div className="exhibitor-preview">
      <div className="exhibitor-preview-header">
        <span className="exhibitor-preview-title">Exhibitors</span>
        <span className="exhibitor-preview-count">
          {matched} / {total} enriched from Apollo
        </span>
      </div>
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
            {visible.map((row) => (
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
      {overflow > 0 && (
        <div className="exhibitor-preview-overflow">
          …and {overflow} more
        </div>
      )}
    </div>
  );
}
