"use client";

import { useEffect, useState } from "react";
import { getAgentActivity } from "@/app/library/admin/actions";
import type { AgentActivity } from "@/lib/library/extraction-queries";

const POLL_MS = 10_000;
const ONLINE_WINDOW_MS = 2 * 60 * 1000; // recent claim → assume polling now
const QUIET_WINDOW_MS = 30 * 60 * 1000; // no claim but recent overall → idle-ok

type AgentStatus = "online" | "idle" | "offline" | "unknown";

const STATUS_STYLE: Record<AgentStatus, { background: string; color: string; border: string; label: string }> = {
  online: { background: "#193b2a", color: "#a3e0b8", border: "1px solid #2c6b48", label: "ONLINE" },
  idle: { background: "#1f2937", color: "#cbd5e1", border: "1px solid #475569", label: "IDLE" },
  offline: { background: "#3b1919", color: "#e0a3a3", border: "1px solid #6b2c2c", label: "OFFLINE" },
  unknown: { background: "#0f172a", color: "#94a3b8", border: "1px solid #334155", label: "UNKNOWN" },
};

function relTime(iso: string | null): string {
  if (!iso) return "never";
  const ms = Date.now() - new Date(iso).getTime();
  if (ms < 0) return "just now";
  if (ms < 60_000) return `${Math.floor(ms / 1000)}s ago`;
  if (ms < 3_600_000) return `${Math.floor(ms / 60_000)}m ago`;
  if (ms < 86_400_000) return `${Math.floor(ms / 3_600_000)}h ago`;
  return `${Math.floor(ms / 86_400_000)}d ago`;
}

function judgeStatus(a: AgentActivity): AgentStatus {
  // In-flight work is the most decisive signal.
  if (a.claimed_count > 0) return "online";
  if (!a.last_claim_at) {
    return a.pending_count > 0 ? "offline" : "unknown";
  }
  const sinceClaim = Date.now() - new Date(a.last_claim_at).getTime();
  if (sinceClaim < ONLINE_WINDOW_MS) return "online";
  // Pending jobs + no recent claim = the queue's growing but nobody's reading it.
  if (a.pending_count > 0) return "offline";
  // No pending + last claim in the last 30m = the agent worked recently and queue's now drained.
  if (sinceClaim < QUIET_WINDOW_MS) return "idle";
  return "offline";
}

export function AgentStatusBadge() {
  const [activity, setActivity] = useState<AgentActivity | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    const tick = async () => {
      try {
        const a = await getAgentActivity();
        if (alive) {
          setActivity(a);
          setError(null);
        }
      } catch (err) {
        if (alive) setError(err instanceof Error ? err.message : String(err));
      }
    };
    void tick();
    const id = setInterval(tick, POLL_MS);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, []);

  const wrapStyle: React.CSSProperties = {
    display: "flex",
    flexWrap: "wrap",
    gap: 12,
    alignItems: "center",
    padding: "8px 12px",
    borderRadius: 6,
    fontSize: 13,
    marginBottom: 16,
  };

  if (error) {
    const s = STATUS_STYLE.unknown;
    return (
      <div style={{ ...wrapStyle, background: s.background, color: s.color, border: s.border }}>
        <span style={{ fontFamily: "monospace", fontWeight: 600 }}>AGENT: ?</span>
        <span>couldn't reach Supabase: {error}</span>
      </div>
    );
  }
  if (!activity) {
    const s = STATUS_STYLE.unknown;
    return (
      <div style={{ ...wrapStyle, background: s.background, color: s.color, border: s.border }}>
        <span style={{ fontFamily: "monospace", fontWeight: 600 }}>AGENT: …</span>
        <span>checking activity</span>
      </div>
    );
  }

  const status = judgeStatus(activity);
  const s = STATUS_STYLE[status];
  const showStartHint =
    status === "offline" || (status === "unknown" && activity.pending_count > 0);

  return (
    <div style={{ ...wrapStyle, background: s.background, color: s.color, border: s.border }}>
      <span style={{ fontFamily: "monospace", fontWeight: 600 }}>AGENT: {s.label}</span>
      <span>
        last claim {relTime(activity.last_claim_at)}
        {activity.last_worker_id ? ` by ${activity.last_worker_id}` : ""}
      </span>
      {activity.pending_count > 0 ? <span>· {activity.pending_count} pending</span> : null}
      {activity.claimed_count > 0 ? <span>· {activity.claimed_count} in-flight</span> : null}
      {activity.done_in_last_hour > 0 ? (
        <span style={{ opacity: 0.75 }}>· {activity.done_in_last_hour} done in last 1h</span>
      ) : null}
      {showStartHint ? (
        <span style={{ marginLeft: "auto", opacity: 0.9 }}>
          Run <code>cd ~/local-extract-agent &amp;&amp; pnpm start</code>
        </span>
      ) : null}
    </div>
  );
}
