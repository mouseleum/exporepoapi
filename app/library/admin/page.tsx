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
  listAllAdminEvents,
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
    <div className="wrap">
      <Header />
      <TopNav />

      <div className="hero">
        <h1>
          Curate the calendar.
          <br />
          <span className="hl-blue">Add a show, fetch the floor.</span>
        </h1>
        <p>
          Add events Romify cares about. Cron will scrape DIMEDIS and
          Cybersec Europe automatically once a week, or use Fetch now.
        </p>
      </div>

      <div className="results-section">
        <div className="results-header">
          <span className="results-title">Add event</span>
        </div>
        <EventAddForm onCreate={handleCreate} busy={creating} />
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
          onFetch={handleFetch}
          onDelete={handleDelete}
        />
      </div>
    </div>
  );
}
