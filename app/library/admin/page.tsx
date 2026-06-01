"use client";

import { useEffect, useState } from "react";
import { Header } from "@/components/Header";
import { TopNav } from "@/components/TopNav";
import { StatusBox } from "@/components/StatusBox";
import { EventAddForm } from "@/components/library/EventAddForm";
import { EventAdminTable } from "@/components/library/EventAdminTable";
import {
  createEvent,
  deleteEvent,
  getExtractionJobStatus,
  inferEventFromUrl,
  listAllAdminEvents,
  queueExtractionViaAgent,
  triggerEventFetch,
  updateEvent,
} from "@/app/library/admin/actions";
import type { AdminEventRow } from "@/lib/library/admin-queries";
import type { Status } from "@/lib/types";

export default function AdminPage() {
  const [rows, setRows] = useState<AdminEventRow[]>([]);
  const [status, setStatus] = useState<Status>({ kind: "idle" });
  const [creating, setCreating] = useState(false);

  const reload = async () => {
    setStatus({ kind: "loading", message: "Loading events…" });
    try {
      const fresh = await listAllAdminEvents();
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

  const handleCreate = async (input: Parameters<typeof createEvent>[0]) => {
    setCreating(true);
    setStatus({ kind: "loading", message: `Creating ${input.slug}…` });
    try {
      await createEvent(input);
      await reload();
      setStatus({ kind: "info", message: `✓ Created ${input.slug}` });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setStatus({ kind: "error", message: "Create failed: " + message });
      throw err;
    } finally {
      setCreating(false);
    }
  };

  const handleToggleRomify = async (id: string, value: boolean) => {
    const before = rows;
    setRows((rs) =>
      rs.map((r) => (r.id === id ? { ...r, romify_attending: value } : r)),
    );
    try {
      await updateEvent(id, { romify_attending: value });
    } catch (err) {
      setRows(before);
      const message = err instanceof Error ? err.message : String(err);
      setStatus({ kind: "error", message: "Toggle failed: " + message });
    }
  };

  const handleTogglePeople = async (id: string, value: boolean) => {
    const before = rows;
    setRows((rs) =>
      rs.map((r) => {
        if (r.id !== id) return r;
        const cfg = { ...((r.adapter_config as Record<string, unknown>) ?? {}) };
        if (value) cfg.includePeople = true;
        else delete cfg.includePeople;
        return { ...r, adapter_config: cfg };
      }),
    );
    try {
      const row = before.find((r) => r.id === id);
      const cfg = { ...((row?.adapter_config as Record<string, unknown>) ?? {}) };
      if (value) cfg.includePeople = true;
      else delete cfg.includePeople;
      await updateEvent(id, { adapter_config: cfg });
      setStatus({
        kind: "info",
        message: value
          ? `✓ People fetch enabled for ${row?.slug ?? id} — hit Fetch now`
          : `✓ People fetch disabled for ${row?.slug ?? id}`,
      });
    } catch (err) {
      setRows(before);
      const message = err instanceof Error ? err.message : String(err);
      setStatus({ kind: "error", message: "Toggle failed: " + message });
    }
  };

  const handleToggleCountry = async (id: string, value: boolean) => {
    const before = rows;
    setRows((rs) =>
      rs.map((r) => {
        if (r.id !== id) return r;
        const cfg = { ...((r.adapter_config as Record<string, unknown>) ?? {}) };
        if (value) cfg.includeCountry = true;
        else delete cfg.includeCountry;
        return { ...r, adapter_config: cfg };
      }),
    );
    try {
      const row = before.find((r) => r.id === id);
      const cfg = { ...((row?.adapter_config as Record<string, unknown>) ?? {}) };
      if (value) cfg.includeCountry = true;
      else delete cfg.includeCountry;
      await updateEvent(id, { adapter_config: cfg });
      setStatus({
        kind: "info",
        message: value
          ? `✓ Country fetch enabled for ${row?.slug ?? id} — hit Fetch now`
          : `✓ Country fetch disabled for ${row?.slug ?? id}`,
      });
    } catch (err) {
      setRows(before);
      const message = err instanceof Error ? err.message : String(err);
      setStatus({ kind: "error", message: "Toggle failed: " + message });
    }
  };

  const handleFetch = async (id: string) => {
    const row = rows.find((r) => r.id === id);
    setStatus({
      kind: "loading",
      message: `Fetching ${row?.slug ?? id}…`,
    });
    try {
      const result = await triggerEventFetch(id);
      await reload();
      setStatus({
        kind: "info",
        message: `✓ Fetched ${result.slug}: ${result.upserted} exhibitors (${result.dupes} dupes) in ${(result.elapsed_ms / 1000).toFixed(1)}s`,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setStatus({ kind: "error", message: "Fetch failed: " + message });
    }
  };

  const handleExtractViaAgent = async (id: string) => {
    const row = rows.find((r) => r.id === id);
    const label = row?.slug ?? id;
    setStatus({
      kind: "loading",
      message: `Queueing '${label}' for the extraction agent…`,
    });
    let jobId: string;
    try {
      jobId = await queueExtractionViaAgent(id);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setStatus({ kind: "error", message: "Queue failed: " + message });
      return;
    }
    setStatus({
      kind: "loading",
      message: `Queued '${label}' (job ${jobId.slice(0, 8)})…  waiting for agent to claim and finish.`,
    });
    const startedAt = Date.now();
    const timeoutMs = 10 * 60 * 1000;
    const pollMs = 5000;
    while (Date.now() - startedAt < timeoutMs) {
      await new Promise((r) => setTimeout(r, pollMs));
      try {
        const job = await getExtractionJobStatus(jobId);
        if (!job) continue;
        if (job.status === "claimed" || job.status === "pending") {
          setStatus({
            kind: "loading",
            message: `'${label}' — ${job.status}${job.worker_id ? ` by ${job.worker_id}` : ""} (${Math.round((Date.now() - startedAt) / 1000)}s)…`,
          });
          continue;
        }
        if (job.status === "done") {
          await reload();
          setStatus({
            kind: "info",
            message: `✓ Agent extracted '${label}': ${JSON.stringify(job.summary)}`,
          });
          return;
        }
        setStatus({
          kind: "error",
          message: `Agent ${job.status} on '${label}': ${job.error ?? "(no error message)"}`,
        });
        return;
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        setStatus({ kind: "error", message: "Polling failed: " + message });
        return;
      }
    }
    setStatus({
      kind: "error",
      message: `Agent did not finish '${label}' within ${timeoutMs / 60000}m — check the agent process and extraction_jobs row ${jobId}`,
    });
  };

  const handleDelete = async (id: string) => {
    const row = rows.find((r) => r.id === id);
    setStatus({ kind: "loading", message: `Deleting ${row?.slug ?? id}…` });
    try {
      await deleteEvent(id);
      await reload();
      setStatus({
        kind: "info",
        message: `✓ Deleted ${row?.slug ?? id}`,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setStatus({ kind: "error", message: "Delete failed: " + message });
    }
  };

  return (
    <div className="wrap wrap-wide">
      <Header />
      <TopNav />

      <div className="hero">
        <h1>
          Curate the calendar.
          <br />
          <span className="hl-blue">Add a show, fetch the floor.</span>
        </h1>
        <p>
          Add events my company cares about. Cron will scrape DIMEDIS and
          Cybersec Europe automatically once a week, or use Fetch now.
        </p>
      </div>

      <div className="results-section">
        <div className="results-header">
          <span className="results-title">Add event</span>
        </div>
        <EventAddForm
          onCreate={handleCreate}
          onInfer={inferEventFromUrl}
          busy={creating}
        />
      </div>

      <StatusBox status={status} />

      <div className="results-section">
        <div className="results-header">
          <span className="results-title">All events</span>
          <span className="results-count">{rows.length}</span>
        </div>
        <EventAdminTable
          rows={rows}
          onToggleRomify={handleToggleRomify}
          onTogglePeople={handleTogglePeople}
          onToggleCountry={handleToggleCountry}
          onFetch={handleFetch}
          onExtractViaAgent={handleExtractViaAgent}
          onDelete={handleDelete}
        />
      </div>
    </div>
  );
}
