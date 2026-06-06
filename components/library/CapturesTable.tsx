"use client";

import { useState } from "react";
import type { ExtractionCaptureView } from "@/lib/library/extraction-queries";

type Props = {
  rows: ExtractionCaptureView[];
  onSaveNotes: (captureId: string, notes: string) => Promise<void>;
  onTogglePromoted: (captureId: string, promote: boolean) => Promise<void>;
};

function host(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  return iso.slice(0, 10);
}

function compactJson(value: unknown): string {
  if (value == null) return "—";
  try {
    return JSON.stringify(value);
  } catch {
    return "—";
  }
}

export function CapturesTable({ rows, onSaveNotes, onTogglePromoted }: Props) {
  const [draftNotes, setDraftNotes] = useState<Record<string, string>>({});
  const [busyId, setBusyId] = useState<string | null>(null);

  if (rows.length === 0) {
    return <div className="empty-state">No captures yet — run an Extract via Agent job first.</div>;
  }

  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Event</th>
            <th>Request host</th>
            <th>Method</th>
            <th>response_path</th>
            <th>field_map</th>
            <th>Pagination</th>
            <th>Discovered by</th>
            <th>Confidence</th>
            <th>Promoted</th>
            <th>Created</th>
            <th>Notes</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const busy = busyId === r.id;
            const promoted = !!r.promoted_at;
            const notes = draftNotes[r.id] ?? r.notes ?? "";
            return (
              <tr key={r.id}>
                <td className="company-cell">
                  <div>{r.event_slug}</div>
                  <div className="industry-cell">{r.event_name}</div>
                </td>
                <td className="hall-cell" title={r.request_url}>
                  {host(r.request_url)}
                </td>
                <td className="hall-cell">{r.request_method}</td>
                <td className="hall-cell">
                  <code>{r.response_path || "(root)"}</code>
                </td>
                <td className="industry-cell">
                  <code>{compactJson(r.field_map)}</code>
                </td>
                <td className="industry-cell">
                  <code>{compactJson(r.pagination)}</code>
                </td>
                <td className="hall-cell">{r.discovered_by}</td>
                <td className="hall-cell">
                  {r.confidence != null ? r.confidence.toFixed(2) : "—"}
                </td>
                <td className="hall-cell">{fmtDate(r.promoted_at)}</td>
                <td className="hall-cell">{fmtDate(r.created_at)}</td>
                <td>
                  <textarea
                    value={notes}
                    disabled={busy}
                    rows={2}
                    style={{ width: "100%", minWidth: 180 }}
                    onChange={(e) =>
                      setDraftNotes((d) => ({ ...d, [r.id]: e.target.value }))
                    }
                    onBlur={async () => {
                      if (notes === (r.notes ?? "")) return;
                      setBusyId(r.id);
                      try {
                        await onSaveNotes(r.id, notes);
                      } finally {
                        setBusyId(null);
                      }
                    }}
                  />
                </td>
                <td>
                  <button
                    type="button"
                    className={promoted ? "btn btn-danger" : "btn btn-secondary"}
                    disabled={busy}
                    onClick={async () => {
                      setBusyId(r.id);
                      try {
                        await onTogglePromoted(r.id, !promoted);
                      } finally {
                        setBusyId(null);
                      }
                    }}
                  >
                    {promoted ? "Un-promote" : "Mark promoted"}
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
