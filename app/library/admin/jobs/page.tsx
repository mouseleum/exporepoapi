"use client";

import { useEffect, useMemo, useState } from "react";
import { Header } from "@/components/Header";
import { TopNav } from "@/components/TopNav";
import { StatusBox } from "@/components/StatusBox";
import { JobsTable } from "@/components/library/JobsTable";
import { AgentStatusBadge } from "@/components/library/AgentStatusBadge";
import { listJobs } from "@/app/library/admin/actions";
import type {
  ExtractionJobListRow,
  ExtractionJobStatus,
} from "@/lib/library/extraction-queries";
import type { Status } from "@/lib/types";

const STATUSES: (ExtractionJobStatus | "all")[] = [
  "all",
  "pending",
  "claimed",
  "done",
  "failed",
  "needs_review",
  "rejected",
];

export default function JobsPage() {
  const [rows, setRows] = useState<ExtractionJobListRow[]>([]);
  const [filter, setFilter] = useState<ExtractionJobStatus | "all">("all");
  const [status, setStatus] = useState<Status>({ kind: "idle" });

  const reload = async () => {
    setStatus({ kind: "loading", message: "Loading jobs…" });
    try {
      const fresh = await listJobs();
      setRows(fresh);
      setStatus({ kind: "idle" });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setStatus({ kind: "error", message: "Load failed: " + message });
    }
  };

  useEffect(() => {
    void reload();
  }, []);

  const filteredRows = useMemo(() => {
    if (filter === "all") return rows;
    return rows.filter((r) => r.status === filter);
  }, [rows, filter]);

  const counts = useMemo(() => {
    const byStatus: Record<string, number> = { all: rows.length };
    for (const r of rows) {
      byStatus[r.status] = (byStatus[r.status] ?? 0) + 1;
    }
    return byStatus;
  }, [rows]);

  return (
    <div className="wrap wrap-wide">
      <Header />
      <TopNav />

      <div className="hero">
        <h1>
          Extraction jobs.
          <br />
          <span className="hl-blue">What the agent has run, and what's stuck.</span>
        </h1>
        <p>
          Every job the agent has claimed, regardless of which event triggered it.
          Click the row arrow to read the full summary and error payload.{" "}
          <a href="/library/admin">← Back to events</a>{" "}
          <a href="/library/admin/captures">View captures →</a>
        </p>
      </div>

      <AgentStatusBadge />

      <StatusBox status={status} />

      <div className="results-section">
        <div className="results-header" style={{ alignItems: "center", gap: 12 }}>
          <span className="results-title">Jobs</span>
          <span className="results-count">{filteredRows.length}</span>
          <select
            value={filter}
            onChange={(e) => setFilter(e.target.value as ExtractionJobStatus | "all")}
            style={{ marginLeft: "auto" }}
          >
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {s} ({counts[s] ?? 0})
              </option>
            ))}
          </select>
          <button type="button" className="btn btn-secondary" onClick={() => void reload()}>
            Reload
          </button>
        </div>
        <JobsTable rows={filteredRows} />
      </div>
    </div>
  );
}
