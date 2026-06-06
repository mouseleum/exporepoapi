"use client";

import { useEffect, useState } from "react";
import { Header } from "@/components/Header";
import { TopNav } from "@/components/TopNav";
import { StatusBox } from "@/components/StatusBox";
import { CapturesTable } from "@/components/library/CapturesTable";
import {
  listCaptures,
  updateCaptureNotes,
  togglePromoted,
} from "@/app/library/admin/actions";
import type { ExtractionCaptureView } from "@/lib/library/extraction-queries";
import type { Status } from "@/lib/types";

export default function CapturesPage() {
  const [rows, setRows] = useState<ExtractionCaptureView[]>([]);
  const [status, setStatus] = useState<Status>({ kind: "idle" });

  const reload = async () => {
    setStatus({ kind: "loading", message: "Loading captures…" });
    try {
      const fresh = await listCaptures();
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

  const handleSaveNotes = async (captureId: string, notes: string) => {
    setStatus({ kind: "loading", message: "Saving notes…" });
    try {
      await updateCaptureNotes(captureId, notes);
      setRows((rs) => rs.map((r) => (r.id === captureId ? { ...r, notes } : r)));
      setStatus({ kind: "info", message: "✓ Notes saved" });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setStatus({ kind: "error", message: "Save failed: " + message });
    }
  };

  const handleTogglePromoted = async (captureId: string, promote: boolean) => {
    setStatus({
      kind: "loading",
      message: promote ? "Marking promoted…" : "Un-promoting…",
    });
    try {
      await togglePromoted(captureId, promote);
      const promotedAt = promote ? new Date().toISOString() : null;
      setRows((rs) =>
        rs.map((r) => (r.id === captureId ? { ...r, promoted_at: promotedAt } : r)),
      );
      setStatus({
        kind: "info",
        message: promote ? "✓ Marked promoted" : "✓ Un-promoted",
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setStatus({ kind: "error", message: "Update failed: " + message });
    }
  };

  return (
    <div className="wrap wrap-wide">
      <Header />
      <TopNav />

      <div className="hero">
        <h1>
          Extraction captures.
          <br />
          <span className="hl-blue">Review what the agent found.</span>
        </h1>
        <p>
          Each row is a discovered XHR shape from a successful agent run. When
          the same host appears across several captures, hand-write a coded
          adapter in <code>lib/adapters/</code> and mark the source capture
          promoted so the cache stays in sync.
        </p>
      </div>

      <StatusBox status={status} />

      <div className="results-section">
        <div className="results-header">
          <span className="results-title">All captures</span>
          <span className="results-count">{rows.length}</span>
        </div>
        <CapturesTable
          rows={rows}
          onSaveNotes={handleSaveNotes}
          onTogglePromoted={handleTogglePromoted}
        />
      </div>
    </div>
  );
}
