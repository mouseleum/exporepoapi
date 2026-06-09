"use client";

import { useEffect, useMemo, useState } from "react";
import { Header } from "@/components/Header";
import { TopNav } from "@/components/TopNav";
import { StatusBox } from "@/components/StatusBox";
import {
  listCompanies,
  overrideCompanyCountry,
} from "@/app/library/companies/actions";
import type { CompanyRow } from "@/lib/library/companies-queries";
import type { Status } from "@/lib/types";

type FilterKind =
  | "all"
  | "missing"
  | "overrides"
  | "hs_met_me"
  | "hs_met_team"
  | "hs_in_pipeline"
  | "hs_no_match"
  | string;

type HubspotStatus =
  | { connected: false }
  | {
      connected: true;
      currentUserEmail: string | null;
      lastSyncedAt: string | null;
      migrationPending?: boolean;
    };

function formatRelative(iso: string | null): string {
  if (!iso) return "never";
  const then = new Date(iso).getTime();
  if (!Number.isFinite(then)) return "unknown";
  const diffSec = Math.max(0, Math.round((Date.now() - then) / 1000));
  if (diffSec < 60) return `${diffSec}s ago`;
  if (diffSec < 3600) return `${Math.round(diffSec / 60)}m ago`;
  if (diffSec < 86_400) return `${Math.round(diffSec / 3600)}h ago`;
  return `${Math.round(diffSec / 86_400)}d ago`;
}

function flag(country: string | null): string {
  if (!country || !/^[A-Z]{2}$/.test(country)) return "";
  // Regional Indicator Symbol Letter A = U+1F1E6.
  return String.fromCodePoint(
    ...[...country].map((c) => 0x1f1e6 + c.charCodeAt(0) - 65),
  );
}

function confidenceColor(c: string | null): string {
  if (c === "override") return "var(--accent, #00e5a0)";
  if (c === "pdl") return "#ffaa00";
  if (c === "wiki") return "#00ccff";
  if (c === "suffix") return "#8b8bff";
  return "#7a7a88";
}

export default function CompaniesPage() {
  const [rows, setRows] = useState<CompanyRow[]>([]);
  const [status, setStatus] = useState<Status>({ kind: "idle" });
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<FilterKind>("all");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [hubspot, setHubspot] = useState<HubspotStatus | null>(null);
  const [syncing, setSyncing] = useState(false);

  async function reloadHubspotStatus(): Promise<void> {
    try {
      const res = await fetch("/api/hubspot/status", { cache: "no-store" });
      if (!res.ok) return;
      const data = (await res.json()) as HubspotStatus;
      setHubspot(data);
    } catch {
      /* network blip — leave previous state */
    }
  }

  async function reloadCompanies(): Promise<void> {
    setStatus({ kind: "loading", message: "Loading companies…" });
    try {
      const data = await listCompanies();
      setRows(data);
      setStatus({ kind: "idle" });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setStatus({ kind: "error", message: "Load failed: " + message });
    }
  }

  useEffect(() => {
    void reloadCompanies();
    void reloadHubspotStatus();
  }, []);

  async function handleSync(): Promise<void> {
    setSyncing(true);
    setStatus({ kind: "loading", message: "Syncing HubSpot…" });
    try {
      const res = await fetch("/api/hubspot/sync", { method: "POST" });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(data.error ?? `HTTP ${res.status}`);
      }
      const summary = (await res.json()) as {
        hubspotCompaniesMatched: number;
        signalsWritten: number;
        metByMeCount: number;
        metByTeamCount: number;
        inPipelineCount: number;
        errors: Array<{ message: string }>;
      };
      const errPart = summary.errors.length > 0 ? ` · ${summary.errors.length} errors` : "";
      setStatus({
        kind: "info",
        message:
          `✓ Synced. ${summary.signalsWritten}/${summary.hubspotCompaniesMatched} matched · ` +
          `${summary.metByMeCount} met by you · ${summary.metByTeamCount} met by team · ` +
          `${summary.inPipelineCount} in pipeline${errPart}`,
      });
      await reloadCompanies();
      await reloadHubspotStatus();
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setStatus({ kind: "error", message: "Sync failed: " + message });
    } finally {
      setSyncing(false);
    }
  }


  const stats = useMemo(() => {
    const total = rows.length;
    const resolved = rows.filter((r) => r.country).length;
    const overrides = rows.filter((r) => r.country_confidence === "override").length;
    const missing = total - resolved;
    const byCountry = new Map<string, number>();
    for (const r of rows) {
      if (!r.country) continue;
      byCountry.set(r.country, (byCountry.get(r.country) ?? 0) + 1);
    }
    const top = Array.from(byCountry.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10);

    const matched = rows.filter((r) => r.hubspot).length;
    const metByMe = rows.filter((r) => r.hubspot?.met_by_me).length;
    const metByTeam = rows.filter((r) => r.hubspot?.met_by_team).length;
    const inPipeline = rows.filter((r) => r.hubspot?.in_pipeline).length;

    return { total, resolved, missing, overrides, top, matched, metByMe, metByTeam, inPipeline };
  }, [rows]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((r) => {
      if (filter === "missing" && r.country) return false;
      if (filter === "overrides" && r.country_confidence !== "override") return false;
      if (filter === "hs_met_me" && !r.hubspot?.met_by_me) return false;
      if (filter === "hs_met_team" && !r.hubspot?.met_by_team) return false;
      if (filter === "hs_in_pipeline" && !r.hubspot?.in_pipeline) return false;
      if (filter === "hs_no_match" && r.hubspot) return false;
      const isCountryFilter =
        filter !== "all" &&
        filter !== "missing" &&
        filter !== "overrides" &&
        filter !== "hs_met_me" &&
        filter !== "hs_met_team" &&
        filter !== "hs_in_pipeline" &&
        filter !== "hs_no_match";
      if (isCountryFilter && r.country !== filter) return false;
      if (!q) return true;
      if (r.name.toLowerCase().includes(q)) return true;
      if (r.name_normalized.includes(q)) return true;
      for (const a of r.aliases) {
        if (a.toLowerCase().includes(q)) return true;
      }
      return false;
    });
  }, [rows, search, filter]);

  const VISIBLE = 200;
  const visible = filtered.slice(0, VISIBLE);

  const handleOverride = async (id: string, iso: string) => {
    try {
      const updated = await overrideCompanyCountry(id, iso);
      // Server action doesn't carry HubSpot signals — re-merge from current state.
      setRows((rs) =>
        rs.map((r) => (r.id === id ? { ...updated, hubspot: r.hubspot } : r)),
      );
      setEditingId(null);
      setStatus({
        kind: "info",
        message: `✓ Override saved: ${updated.name} → ${updated.country}`,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setStatus({ kind: "error", message: "Override failed: " + message });
    }
  };

  return (
    <div className="wrap wrap-wide">
      <Header />
      <TopNav />

      <div className="hero">
        <h1>
          Every company.
          <br />
          <span className="hl-blue">Override a country in one click.</span>
        </h1>
        <p>
          Backs the Ranker&apos;s country-fill step. Manual overrides win over PDL,
          Wikipedia, and suffix-guess data on the next scoring run.
        </p>
      </div>

      <HubspotStrip status={hubspot} syncing={syncing} onSync={handleSync} />


      <div className="results-section">
        <div className="results-header">
          <span className="results-title">Stats</span>
        </div>
        <div style={{ padding: "12px 16px", display: "flex", gap: 16, flexWrap: "wrap", fontFamily: "var(--mono, monospace)", fontSize: 13 }}>
          <span><strong>{stats.total}</strong> companies</span>
          <span><strong>{stats.resolved}</strong> with country</span>
          <span><strong>{stats.missing}</strong> missing</span>
          <span><strong>{stats.overrides}</strong> manual overrides</span>
          {stats.matched > 0 && (
            <>
              <span style={{ color: "#7a7a88" }}>·</span>
              <span><strong>{stats.matched}</strong> HubSpot match</span>
              <span style={{ color: "#7a7a88" }}>{stats.metByMe} met by you</span>
              <span style={{ color: "#7a7a88" }}>{stats.metByTeam} met by team</span>
              <span style={{ color: "#7a7a88" }}>{stats.inPipeline} in pipeline</span>
            </>
          )}
          <span style={{ color: "#7a7a88" }}>·</span>
          {stats.top.map(([cc, n]) => (
            <span key={cc}>
              {flag(cc)} {cc} <span style={{ color: "#7a7a88" }}>{n}</span>
            </span>
          ))}
        </div>
      </div>

      <StatusBox status={status} />

      <div className="results-section">
        <div className="results-header">
          <span className="results-title">Companies</span>
          <span className="results-count">
            {filtered.length === rows.length
              ? rows.length
              : `${filtered.length} / ${rows.length}`}
            {filtered.length > VISIBLE ? ` (showing first ${VISIBLE})` : ""}
          </span>
        </div>

        <div style={{ padding: "12px 16px", display: "flex", flexDirection: "column", gap: 10 }}>
          <input
            type="search"
            placeholder="Search by name or alias…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{ padding: "8px 12px", fontSize: 14 }}
          />
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            <FilterChip active={filter === "all"} onClick={() => setFilter("all")}>
              All ({stats.total})
            </FilterChip>
            <FilterChip active={filter === "missing"} onClick={() => setFilter("missing")}>
              Missing ({stats.missing})
            </FilterChip>
            <FilterChip
              active={filter === "overrides"}
              onClick={() => setFilter("overrides")}
            >
              Overrides ({stats.overrides})
            </FilterChip>
            {stats.matched > 0 && (
              <>
                <FilterChip
                  active={filter === "hs_met_me"}
                  onClick={() => setFilter("hs_met_me")}
                >
                  💼 Met by you ({stats.metByMe})
                </FilterChip>
                <FilterChip
                  active={filter === "hs_met_team"}
                  onClick={() => setFilter("hs_met_team")}
                >
                  👥 Met by team ({stats.metByTeam})
                </FilterChip>
                <FilterChip
                  active={filter === "hs_in_pipeline"}
                  onClick={() => setFilter("hs_in_pipeline")}
                >
                  📈 In pipeline ({stats.inPipeline})
                </FilterChip>
                <FilterChip
                  active={filter === "hs_no_match"}
                  onClick={() => setFilter("hs_no_match")}
                >
                  No HubSpot ({stats.total - stats.matched})
                </FilterChip>
              </>
            )}
            {stats.top.slice(0, 10).map(([cc, n]) => (
              <FilterChip
                key={cc}
                active={filter === cc}
                onClick={() => setFilter(cc)}
              >
                {flag(cc)} {cc} ({n})
              </FilterChip>
            ))}
          </div>
        </div>

        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
          <thead>
            <tr style={{ textAlign: "left", borderBottom: "1px solid #2a2a30" }}>
              <th style={{ padding: "8px 12px" }}>NAME</th>
              <th style={{ padding: "8px 12px", width: 140 }}>COUNTRY</th>
              <th style={{ padding: "8px 12px", width: 90 }}>VIA</th>
              <th style={{ padding: "8px 12px", width: 200 }}>SOURCES</th>
              {hubspot?.connected && (
                <th style={{ padding: "8px 12px", width: 200 }}>HUBSPOT</th>
              )}
            </tr>
          </thead>
          <tbody>
            {visible.map((r) => {
              const editing = editingId === r.id;
              return (
                <tr key={r.id} style={{ borderBottom: "1px solid #2a2a3022" }}>
                  <td style={{ padding: "8px 12px" }}>
                    <div>{r.name}</div>
                    {r.aliases.length > 0 && (
                      <div style={{ fontSize: 11, color: "#7a7a88", marginTop: 2 }}>
                        {r.aliases.slice(0, 2).join(" · ")}
                        {r.aliases.length > 2 ? ` +${r.aliases.length - 2}` : ""}
                      </div>
                    )}
                  </td>
                  <td style={{ padding: "8px 12px" }}>
                    {editing ? (
                      <OverrideInput
                        initial={r.country ?? ""}
                        onSave={(iso) => handleOverride(r.id, iso)}
                        onCancel={() => setEditingId(null)}
                      />
                    ) : (
                      <span
                        style={{ cursor: "pointer", display: "inline-flex", gap: 6, alignItems: "center" }}
                        onClick={() => setEditingId(r.id)}
                        title="Click to override"
                      >
                        <span style={{ fontSize: 18 }}>{flag(r.country)}</span>
                        <span style={{ fontFamily: "var(--mono, monospace)" }}>
                          {r.country ?? "—"}
                        </span>
                      </span>
                    )}
                  </td>
                  <td style={{ padding: "8px 12px" }}>
                    <span
                      style={{
                        fontFamily: "var(--mono, monospace)",
                        fontSize: 11,
                        padding: "2px 6px",
                        border: `1px solid ${confidenceColor(r.country_confidence)}66`,
                        color: confidenceColor(r.country_confidence),
                        borderRadius: 3,
                      }}
                    >
                      {r.country_confidence ?? "—"}
                    </span>
                  </td>
                  <td style={{ padding: "8px 12px", fontSize: 11, color: "#7a7a88", fontFamily: "var(--mono, monospace)" }}>
                    {r.country_sources.length > 0 ? r.country_sources.join(", ") : r.source}
                  </td>
                  {hubspot?.connected && (
                    <td style={{ padding: "8px 12px" }}>
                      <HubspotBadges signals={r.hubspot} />
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
        {filtered.length === 0 && (
          <div style={{ padding: 40, textAlign: "center", color: "#7a7a88" }}>
            No companies match
          </div>
        )}
      </div>
    </div>
  );
}

function HubspotStrip({
  status,
  syncing,
  onSync,
}: {
  status: HubspotStatus | null;
  syncing: boolean;
  onSync: () => void;
}) {
  // Until status is loaded we render nothing so the layout doesn't flash a
  // "Not configured" state for users who already have HubSpot wired up.
  if (status === null) return null;

  const baseStyle: React.CSSProperties = {
    display: "flex",
    alignItems: "center",
    gap: 12,
    padding: "10px 16px",
    margin: "12px 0",
    border: "1px solid #2a2a30",
    borderRadius: 6,
    fontFamily: "var(--mono, monospace)",
    fontSize: 13,
    flexWrap: "wrap",
  };

  if (!status.connected) {
    return (
      <div style={baseStyle}>
        <span style={{ color: "#7a7a88" }}>
          HubSpot · <strong style={{ color: "#cfcfd6" }}>Not configured</strong>
        </span>
        <span style={{ color: "#7a7a88", fontSize: 11 }}>
          Set HUBSPOT_ACCESS_TOKEN (+ optional HUBSPOT_OWNER_EMAIL) in env
        </span>
      </div>
    );
  }

  const ownerLabel = status.currentUserEmail
    ? <>as <strong>{status.currentUserEmail}</strong></>
    : <span style={{ color: "#ffaa00" }}>(HUBSPOT_OWNER_EMAIL unset — all engagements read as Team)</span>;

  return (
    <div style={baseStyle}>
      <span style={{ color: "#7a7a88" }}>HubSpot · </span>
      <span>Connected {ownerLabel}</span>
      <span style={{ color: "#7a7a88" }}>·</span>
      <span style={{ color: "#7a7a88" }}>
        Last synced {formatRelative(status.lastSyncedAt)}
      </span>
      {status.migrationPending && (
        <>
          <span style={{ color: "#7a7a88" }}>·</span>
          <span style={{ color: "#ffaa00", fontSize: 11 }}>
            Apply 0009 migration in Supabase to enable signals
          </span>
        </>
      )}
      <span style={{ flex: 1 }} />
      <button
        onClick={onSync}
        disabled={syncing || status.migrationPending}
        style={{
          fontSize: 12,
          padding: "4px 12px",
          background: syncing || status.migrationPending ? "transparent" : "#00e5a022",
          border: `1px solid ${syncing || status.migrationPending ? "#2a2a30" : "#00e5a066"}`,
          color: syncing || status.migrationPending ? "#7a7a88" : "#00e5a0",
          borderRadius: 3,
          cursor: syncing ? "wait" : status.migrationPending ? "not-allowed" : "pointer",
        }}
      >
        {syncing ? "Syncing…" : "Sync now"}
      </button>
    </div>
  );
}

function HubspotBadges({
  signals,
}: {
  signals: CompanyRow["hubspot"];
}) {
  if (!signals) return <span style={{ color: "#7a7a88", fontSize: 11 }}>—</span>;
  const dealTitle = signals.latest_open_deal_stage
    ? `${signals.latest_open_deal_stage}${
        signals.latest_open_deal_amount != null
          ? ` · ${signals.latest_open_deal_amount.toLocaleString()}`
          : ""
      }`
    : "Open deal";
  const meetTitle = signals.last_engagement_owner_name
    ? `Last touch by ${signals.last_engagement_owner_name}${
        signals.last_engagement_at ? ` · ${formatRelative(signals.last_engagement_at)}` : ""
      }`
    : signals.last_engagement_at
      ? `Last touch ${formatRelative(signals.last_engagement_at)}`
      : "Engagement logged";
  return (
    <span style={{ display: "inline-flex", gap: 4, flexWrap: "wrap" }}>
      {signals.met_by_me && (
        <Badge color="#00e5a0" title={meetTitle}>💼 You</Badge>
      )}
      {signals.met_by_team && (
        <Badge color="#00ccff" title={meetTitle}>👥 Team</Badge>
      )}
      {signals.in_pipeline && (
        <Badge color="#ffaa00" title={dealTitle}>📈 Pipeline</Badge>
      )}
    </span>
  );
}

function Badge({
  color,
  title,
  children,
}: {
  color: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <span
      title={title}
      style={{
        fontFamily: "var(--mono, monospace)",
        fontSize: 11,
        padding: "2px 6px",
        border: `1px solid ${color}66`,
        color,
        borderRadius: 3,
        whiteSpace: "nowrap",
      }}
    >
      {children}
    </span>
  );
}

function FilterChip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      style={{
        fontFamily: "var(--mono, monospace)",
        fontSize: 11,
        padding: "4px 10px",
        borderRadius: 20,
        border: `1px solid ${active ? "#00e5a066" : "#2a2a30"}`,
        background: active ? "#00e5a022" : "transparent",
        color: active ? "#00e5a0" : "#7a7a88",
        cursor: "pointer",
      }}
    >
      {children}
    </button>
  );
}

function OverrideInput({
  initial,
  onSave,
  onCancel,
}: {
  initial: string;
  onSave: (iso: string) => void;
  onCancel: () => void;
}) {
  const [val, setVal] = useState(initial.length === 2 ? initial : "");
  const valid = /^[A-Z]{2}$/.test(val);
  return (
    <span style={{ display: "inline-flex", gap: 6, alignItems: "center" }}>
      <input
        autoFocus
        maxLength={2}
        placeholder="XX"
        value={val}
        onChange={(e) => setVal(e.target.value.toUpperCase())}
        onKeyDown={(e) => {
          if (e.key === "Enter" && valid) onSave(val);
          if (e.key === "Escape") onCancel();
        }}
        style={{
          fontFamily: "var(--mono, monospace)",
          width: 48,
          padding: "3px 8px",
          fontSize: 13,
          textAlign: "center",
          textTransform: "uppercase",
        }}
      />
      <button
        onClick={() => valid && onSave(val)}
        disabled={!valid}
        style={{
          fontSize: 12,
          padding: "3px 8px",
          background: valid ? "#00e5a022" : "transparent",
          border: `1px solid ${valid ? "#00e5a066" : "#2a2a30"}`,
          color: valid ? "#00e5a0" : "#7a7a88",
          borderRadius: 3,
          cursor: valid ? "pointer" : "default",
        }}
      >
        ✓
      </button>
      <button
        onClick={onCancel}
        style={{
          fontSize: 12,
          padding: "3px 8px",
          background: "transparent",
          border: "1px solid #2a2a30",
          color: "#7a7a88",
          borderRadius: 3,
          cursor: "pointer",
        }}
      >
        ✕
      </button>
    </span>
  );
}
