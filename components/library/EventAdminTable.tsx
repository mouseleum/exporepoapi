"use client";

import { useState } from "react";
import type { AdminEventRow } from "@/lib/library/admin-queries";

type Props = {
  rows: AdminEventRow[];
  onToggleRomify: (id: string, value: boolean) => Promise<void>;
  onFetch: (id: string) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
};

function formatScraped(iso: string | null): string {
  if (!iso) return "never";
  return iso.slice(0, 10);
}

function formatConfig(cfg: unknown): string {
  if (!cfg || typeof cfg !== "object") return "—";
  const entries = Object.entries(cfg as Record<string, unknown>);
  if (entries.length === 0) return "—";
  return entries.map(([k, v]) => `${k}=${String(v)}`).join(", ");
}

export function EventAdminTable({
  rows,
  onToggleRomify,
  onFetch,
  onDelete,
}: Props) {
  const [busyId, setBusyId] = useState<string | null>(null);

  const handle = async (id: string, fn: () => Promise<void>) => {
    setBusyId(id);
    try {
      await fn();
    } finally {
      setBusyId(null);
    }
  };

  if (rows.length === 0) {
    return <div className="empty-state">No events yet.</div>;
  }

  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Slug</th>
            <th>Name</th>
            <th>Year</th>
            <th>Family</th>
            <th>Config</th>
            <th>Exhibitors</th>
            <th>Last scraped</th>
            <th>My company</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const busy = busyId === r.id;
            return (
              <tr key={r.id}>
                <td className="company-cell">{r.slug}</td>
                <td>{r.name}</td>
                <td className="hall-cell">{r.year ?? "—"}</td>
                <td className="hall-cell">{r.source}</td>
                <td className="industry-cell">{formatConfig(r.adapter_config)}</td>
                <td className="hall-cell">{r.exhibitor_count}</td>
                <td className="hall-cell">{formatScraped(r.scraped_at)}</td>
                <td>
                  <input
                    type="checkbox"
                    checked={r.romify_attending}
                    disabled={busy}
                    onChange={(e) =>
                      handle(r.id, () =>
                        onToggleRomify(r.id, e.target.checked),
                      )
                    }
                  />
                </td>
                <td>
                  <div className="event-admin-row-actions">
                    <button
                      type="button"
                      className="btn btn-secondary"
                      disabled={busy}
                      onClick={() => handle(r.id, () => onFetch(r.id))}
                    >
                      Fetch now
                    </button>
                    <button
                      type="button"
                      className="btn btn-danger"
                      disabled={busy}
                      onClick={() => {
                        if (
                          !confirm(
                            `Delete '${r.slug}'? This also removes all its exhibitors.`,
                          )
                        )
                          return;
                        void handle(r.id, () => onDelete(r.id));
                      }}
                    >
                      Delete
                    </button>
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
