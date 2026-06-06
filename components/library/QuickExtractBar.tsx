"use client";

import { useState } from "react";
import {
  quickExtract,
  getExtractionJobStatus,
} from "@/app/library/admin/actions";

type Props = {
  onJobDone: () => Promise<void> | void;
};

const POLL_MS = 5000;
const TIMEOUT_MS = 10 * 60 * 1000;

export function QuickExtractBar({ onJobDone }: Props) {
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [info, setInfo] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = url.trim();
    if (!trimmed || busy) return;
    setBusy(true);
    setError(null);
    setInfo("Creating event…");
    try {
      const result = await quickExtract(trimmed);
      const reused = result.reused_event ? " (reused)" : "";
      setInfo(`Queued '${result.slug}'${reused} — waiting for the agent to claim…`);

      const startedAt = Date.now();
      let final: Awaited<ReturnType<typeof getExtractionJobStatus>> = null;
      while (Date.now() - startedAt < TIMEOUT_MS) {
        await new Promise((r) => setTimeout(r, POLL_MS));
        const job = await getExtractionJobStatus(result.job_id);
        if (!job) continue;
        if (job.status === "pending" || job.status === "claimed") {
          const elapsedS = Math.round((Date.now() - startedAt) / 1000);
          setInfo(
            `'${result.slug}' — ${job.status}${job.worker_id ? ` by ${job.worker_id}` : ""} (${elapsedS}s)…`,
          );
          continue;
        }
        final = job;
        break;
      }

      if (!final) {
        setError(
          `Agent didn't finish '${result.slug}' within ${TIMEOUT_MS / 60000}m — check /library/admin/jobs (job ${result.job_id.slice(0, 8)})`,
        );
        return;
      }
      if (final.status === "done") {
        setInfo(`✓ '${result.slug}' done — ${JSON.stringify(final.summary)}`);
        setError(null);
        setUrl("");
        await onJobDone();
        return;
      }
      setError(
        `Agent ${final.status} on '${result.slug}': ${final.error ?? "(no error message)"}`,
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="results-section">
      <div className="results-header">
        <span className="results-title">Quick extract</span>
        <span className="results-count">paste URL</span>
      </div>
      <form
        onSubmit={submit}
        style={{
          display: "flex",
          gap: 8,
          alignItems: "center",
          padding: "12px 0",
        }}
      >
        <input
          type="url"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://… — agent infers slug/name/year and extracts the exhibitor list"
          disabled={busy}
          required
          style={{ flex: 1, padding: "8px 10px" }}
        />
        <button
          type="submit"
          className="btn btn-primary"
          disabled={busy || !url.trim()}
        >
          {busy ? "Extracting…" : "Extract"}
        </button>
      </form>
      {info ? (
        <div style={{ opacity: 0.8, fontSize: 14 }}>{info}</div>
      ) : null}
      {error ? (
        <div
          style={{
            color: "#e0a3a3",
            fontSize: 14,
            marginTop: info ? 4 : 0,
          }}
        >
          {error}
        </div>
      ) : null}
    </div>
  );
}
