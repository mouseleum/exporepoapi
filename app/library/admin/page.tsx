"use client";

import { useEffect, useState } from "react";
import { Header } from "@/components/Header";
import { TopNav } from "@/components/TopNav";
import { StatusBox } from "@/components/StatusBox";
import { EventAdminTable } from "@/components/library/EventAdminTable";
import { EventCsvImport } from "@/components/library/EventCsvImport";
import {
  deleteEvent,
  listAllAdminEvents,
  updateEvent,
} from "@/app/library/admin/actions";
import type { AdminEventRow } from "@/lib/library/admin-queries";
import type { Status } from "@/lib/types";

export default function AdminPage() {
  const [rows, setRows] = useState<AdminEventRow[]>([]);
  const [status, setStatus] = useState<Status>({ kind: "idle" });

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

  const handleDelete = async (id: string) => {
    const row = rows.find((r) => r.id === id);
    setStatus({ kind: "loading", message: `Deleting ${row?.slug ?? id}…` });
    try {
      await deleteEvent(id);
      await reload();
      setStatus({ kind: "info", message: `✓ Deleted ${row?.slug ?? id}` });
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
          <span className="hl-blue">Import a list, work the floor.</span>
        </h1>
        <p>
          Add the shows my company cares about by importing their exhibitor
          list as a CSV. Getting that CSV off the fair&apos;s own site happens
          outside this app — then it lands here, gets resolved against the
          company database, and is scored on /library.
        </p>
      </div>

      <div className="results-section">
        <div className="results-header">
          <span className="results-title">Import exhibitor CSV</span>
        </div>
        <EventCsvImport onImported={reload} />
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
          onDelete={handleDelete}
        />
      </div>
    </div>
  );
}
