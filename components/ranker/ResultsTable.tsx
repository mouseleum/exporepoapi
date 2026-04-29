"use client";

import type { RankedRow } from "@/lib/types";

type ResultsTableProps = {
  data: RankedRow[];
  onDownload: () => void;
};

function scoreColor(score: number): string {
  if (score >= 80) return "#4dff91";
  if (score >= 60) return "#ffb547";
  return "#888";
}

function formatEmployees(n: number | null): string {
  if (n === null) return "—";
  return n.toLocaleString();
}

export function ResultsTable({ data, onDownload }: ResultsTableProps) {
  return (
    <div className="results-section">
      <div className="results-header">
        <div style={{ display: "flex", alignItems: "center" }}>
          <span className="results-title">Top targets</span>
          <span className="results-count">{data.length}</span>
        </div>
        <button
          type="button"
          className="btn btn-primary"
          onClick={onDownload}
        >
          <svg
            width="13"
            height="13"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
          >
            <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3" />
          </svg>
          Download CSV
        </button>
      </div>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>#</th>
              <th>Company</th>
              <th>Country</th>
              <th>Hall / Booth</th>
              <th>Employees</th>
              <th>Industry</th>
              <th>Score</th>
            </tr>
          </thead>
          <tbody>
            {data.map((row) => {
              const color = scoreColor(row.score);
              return (
                <tr key={`${row.rank}-${row.name}`}>
                  <td className="rank-cell">{row.rank}</td>
                  <td className="company-cell">{row.name}</td>
                  <td className="country-cell">{row.country}</td>
                  <td className="hall-cell">{row.hall}</td>
                  <td className="country-cell">
                    {formatEmployees(row.employees)}
                  </td>
                  <td className="industry-cell">{row.industry ?? "—"}</td>
                  <td className="score-cell">
                    <div className="score-bar-wrap">
                      <div className="score-bar">
                        <div
                          className="score-bar-fill"
                          style={{ width: `${row.score}%`, background: color }}
                        />
                      </div>
                      <span style={{ color, minWidth: 28 }}>{row.score}</span>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
