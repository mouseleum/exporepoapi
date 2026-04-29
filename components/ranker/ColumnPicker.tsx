"use client";

import type { ColumnSelection } from "@/lib/types";

type ColumnPickerProps = {
  fileName: string;
  rowCount: number;
  countLabel?: string;
  headers: string[];
  selection: ColumnSelection;
  onChange: (sel: ColumnSelection) => void;
};

export function ColumnPicker({
  fileName,
  rowCount,
  countLabel,
  headers,
  selection,
  onChange,
}: ColumnPickerProps) {
  const fields: { key: keyof ColumnSelection; label: string }[] = [
    { key: "name", label: "Company name *" },
    { key: "country", label: "Country" },
    { key: "hall", label: "Hall / Booth" },
  ];

  return (
    <>
      <div className="file-info">
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          style={{ color: "var(--color-success)", flexShrink: 0 }}
        >
          <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
          <polyline points="14 2 14 8 20 8" />
        </svg>
        <span className="file-info-name">{fileName}</span>
        <span className="file-info-count">
          {countLabel ?? `${rowCount} rows`}
        </span>
      </div>
      <div className="col-grid">
        {fields.map((f) => (
          <div key={f.key} className="col-field">
            <label htmlFor={`col-${f.key}`}>{f.label}</label>
            <select
              id={`col-${f.key}`}
              value={selection[f.key]}
              onChange={(e) =>
                onChange({ ...selection, [f.key]: e.target.value })
              }
            >
              <option value="">— none —</option>
              {headers.map((h) => (
                <option key={h} value={h}>
                  {h}
                </option>
              ))}
            </select>
          </div>
        ))}
      </div>
    </>
  );
}
