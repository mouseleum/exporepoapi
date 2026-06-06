"use client";

import { Fragment, useState } from "react";
import type {
  ExtractionJobListRow,
  ExtractionJobStatus,
} from "@/lib/library/extraction-queries";

type Props = {
  rows: ExtractionJobListRow[];
};

const STATUS_PILL_STYLE: Record<ExtractionJobStatus, React.CSSProperties> = {
  done: { background: "#193b2a", color: "#a3e0b8", border: "1px solid #2c6b48" },
  failed: { background: "#3b1919", color: "#e0a3a3", border: "1px solid #6b2c2c" },
  needs_review: { background: "#3b2e19", color: "#e0c8a3", border: "1px solid #6b552c" },
  claimed: { background: "#1f2937", color: "#cbd5e1", border: "1px solid #475569" },
  pending: { background: "#0f172a", color: "#94a3b8", border: "1px solid #334155" },
  rejected: { background: "#1a1a1a", color: "#888", border: "1px solid #333" },
};

const PILL_BASE: React.CSSProperties = {
  display: "inline-block",
  padding: "2px 8px",
  borderRadius: 4,
  fontSize: 12,
  fontFamily:
    "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace",
};

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  return iso.replace("T", " ").slice(0, 19);
}

function compactJson(value: unknown): string {
  if (value == null) return "—";
  try {
    return JSON.stringify(value);
  } catch {
    return "—";
  }
}

function prettyJson(value: unknown): string {
  if (value == null) return "(no summary)";
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

function truncate(s: string | null, n: number): string {
  if (!s) return "—";
  if (s.length <= n) return s;
  return s.slice(0, n) + "…";
}

export function JobsTable({ rows }: Props) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const toggle = (id: string) => {
    setExpanded((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  if (rows.length === 0) {
    return <div className="empty-state">No extraction jobs match this filter.</div>;
  }

  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th></th>
            <th>Event</th>
            <th>Status</th>
            <th>Worker</th>
            <th>Retries</th>
            <th>Summary</th>
            <th>Error</th>
            <th>Created</th>
            <th>Completed</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const isOpen = expanded.has(r.id);
            return (
              <Fragment key={r.id}>
                <tr>
                  <td className="hall-cell">
                    <button
                      type="button"
                      className="btn btn-secondary"
                      style={{ padding: "2px 8px", fontSize: 12 }}
                      onClick={() => toggle(r.id)}
                      aria-label={isOpen ? "Collapse" : "Expand"}
                    >
                      {isOpen ? "▾" : "▸"}
                    </button>
                  </td>
                  <td className="company-cell">
                    <div>{r.event_slug || "(deleted event)"}</div>
                    <div className="industry-cell">{r.event_name}</div>
                  </td>
                  <td className="hall-cell">
                    <span style={{ ...PILL_BASE, ...STATUS_PILL_STYLE[r.status] }}>
                      {r.status}
                    </span>
                  </td>
                  <td className="hall-cell">{r.worker_id ?? "—"}</td>
                  <td className="hall-cell">{r.retry_count}</td>
                  <td className="industry-cell">
                    <code>{truncate(compactJson(r.summary), 70)}</code>
                  </td>
                  <td className="industry-cell" title={r.error ?? undefined}>
                    {truncate(r.error, 60)}
                  </td>
                  <td className="hall-cell">{fmtDate(r.created_at)}</td>
                  <td className="hall-cell">{fmtDate(r.completed_at)}</td>
                </tr>
                {isOpen ? (
                  <tr>
                    <td colSpan={9} style={{ background: "#0a0a0a", padding: 16 }}>
                      <div style={{ display: "grid", gap: 12 }}>
                        <div>
                          <div style={{ fontWeight: 600, marginBottom: 4 }}>summary</div>
                          <pre
                            style={{
                              background: "#000",
                              border: "1px solid #222",
                              padding: 12,
                              borderRadius: 4,
                              overflow: "auto",
                              fontSize: 12,
                              margin: 0,
                            }}
                          >
                            {prettyJson(r.summary)}
                          </pre>
                        </div>
                        {r.error ? (
                          <div>
                            <div style={{ fontWeight: 600, marginBottom: 4 }}>error</div>
                            <pre
                              style={{
                                background: "#000",
                                border: "1px solid #2c1414",
                                padding: 12,
                                borderRadius: 4,
                                overflow: "auto",
                                fontSize: 12,
                                margin: 0,
                                color: "#e0a3a3",
                              }}
                            >
                              {r.error}
                            </pre>
                          </div>
                        ) : null}
                        <div style={{ fontSize: 12, color: "#888" }}>
                          job id: <code>{r.id}</code>
                        </div>
                      </div>
                    </td>
                  </tr>
                ) : null}
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
