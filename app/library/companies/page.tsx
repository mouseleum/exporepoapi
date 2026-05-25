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

type FilterKind = "all" | "missing" | "overrides" | string;

function flag(country: string | null): string {
  if (!country || !/^[A-Z]{2}$/.test(country)) return "";
  return String.fromCodePoint(
    ...[...country].map((c) => 0x1f1e0 + c.charCodeAt(0) - 65),
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

  useEffect(() => {
    void (async () => {
      setStatus({ kind: "loading", message: "Loading companies…" });
      try {
        const data = await listCompanies();
        setRows(data);
        setStatus({ kind: "idle" });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        setStatus({ kind: "error", message: "Load failed: " + message });
      }
    })();
  }, []);

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
    return { total, resolved, missing, overrides, top };
  }, [rows]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((r) => {
      if (filter === "missing" && r.country) return false;
      if (filter === "overrides" && r.country_confidence !== "override") return false;
      if (
        filter !== "all" &&
        filter !== "missing" &&
        filter !== "overrides" &&
        r.country !== filter
      )
        return false;
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
      setRows((rs) => rs.map((r) => (r.id === id ? updated : r)));
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

      <div className="results-section">
        <div className="results-header">
          <span className="results-title">Stats</span>
        </div>
        <div style={{ padding: "12px 16px", display: "flex", gap: 16, flexWrap: "wrap", fontFamily: "var(--mono, monospace)", fontSize: 13 }}>
          <span><strong>{stats.total}</strong> companies</span>
          <span><strong>{stats.resolved}</strong> with country</span>
          <span><strong>{stats.missing}</strong> missing</span>
          <span><strong>{stats.overrides}</strong> manual overrides</span>
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
