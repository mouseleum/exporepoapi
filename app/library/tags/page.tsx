"use client";

import { useEffect, useReducer, useState } from "react";
import { Header } from "@/components/Header";
import { TopNav } from "@/components/TopNav";
import { StatusBox } from "@/components/StatusBox";
import { TagPicker } from "@/components/library/TagPicker";
import {
  bulkSetCompanyTags,
  listTaggedCompanies,
  setCompanyTag,
} from "@/app/library/actions";
import {
  parseTagInput,
  TAG_VALUES,
  type TagValue,
  type TaggedCompanyRow,
} from "@/lib/library/queries";
import { formatRevenueUsd } from "@/lib/library/format";
import type { Status } from "@/lib/types";

type State = {
  rows: TaggedCompanyRow[];
  filter: TagValue | "all";
  status: Status;
};

type Action =
  | { type: "ROWS_LOADED"; rows: TaggedCompanyRow[] }
  | { type: "ROWS_PATCH"; rows: TaggedCompanyRow[] }
  | { type: "ROW_TAG_UPDATED"; name_normalized: string; tag: TagValue | null }
  | { type: "FILTER"; tag: TagValue | "all" }
  | { type: "STATUS"; status: Status };

const initialState: State = {
  rows: [],
  filter: "all",
  status: { kind: "idle" },
};

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case "ROWS_LOADED":
      return { ...state, rows: action.rows, status: { kind: "idle" } };
    case "ROWS_PATCH":
      return { ...state, rows: action.rows };
    case "ROW_TAG_UPDATED": {
      if (action.tag === null) {
        return {
          ...state,
          rows: state.rows.filter(
            (r) => r.name_normalized !== action.name_normalized,
          ),
        };
      }
      return {
        ...state,
        rows: state.rows.map((r) =>
          r.name_normalized === action.name_normalized
            ? { ...r, tag: action.tag as TagValue }
            : r,
        ),
      };
    }
    case "FILTER":
      return { ...state, filter: action.tag };
    case "STATUS":
      return { ...state, status: action.status };
  }
}

function formatEmployees(n: number | null): string {
  return n === null ? "—" : n.toLocaleString();
}

export default function TagsPage() {
  const [state, dispatch] = useReducer(reducer, initialState);
  const [pasteText, setPasteText] = useState("");
  const [pasteTag, setPasteTag] = useState<TagValue>("customer");
  const [isApplying, setIsApplying] = useState(false);

  useEffect(() => {
    let cancelled = false;
    dispatch({
      type: "STATUS",
      status: { kind: "loading", message: "Loading tagged companies…" },
    });
    listTaggedCompanies()
      .then((rows) => {
        if (cancelled) return;
        dispatch({ type: "ROWS_LOADED", rows });
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        const message = err instanceof Error ? err.message : String(err);
        dispatch({
          type: "STATUS",
          status: { kind: "error", message: "Failed to load: " + message },
        });
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const previewNames = parseTagInput(pasteText);

  const handleApply = async () => {
    if (previewNames.length === 0) return;
    setIsApplying(true);
    dispatch({
      type: "STATUS",
      status: {
        kind: "loading",
        message: `Tagging ${previewNames.length} companies as ${pasteTag}…`,
      },
    });
    try {
      const result = await bulkSetCompanyTags(previewNames, pasteTag);
      const fresh = await listTaggedCompanies();
      dispatch({ type: "ROWS_LOADED", rows: fresh });
      dispatch({
        type: "STATUS",
        status: {
          kind: "info",
          message: `✓ Tagged ${result.applied} companies as ${pasteTag} (${result.matched_in_apollo} found in enrichment data)`,
        },
      });
      setPasteText("");
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      dispatch({
        type: "STATUS",
        status: { kind: "error", message: "Bulk tag failed: " + message },
      });
    } finally {
      setIsApplying(false);
    }
  };

  const handleRowTagChange = async (
    name_normalized: string,
    tag: TagValue | null,
  ) => {
    const before = state.rows;
    dispatch({ type: "ROW_TAG_UPDATED", name_normalized, tag });
    try {
      await setCompanyTag(name_normalized, tag);
    } catch (err) {
      dispatch({ type: "ROWS_PATCH", rows: before });
      const message = err instanceof Error ? err.message : String(err);
      dispatch({
        type: "STATUS",
        status: { kind: "error", message: "Tag save failed: " + message },
      });
    }
  };

  const counts = state.rows.reduce<Record<TagValue | "all", number>>(
    (acc, r) => {
      acc[r.tag] = (acc[r.tag] ?? 0) + 1;
      acc.all += 1;
      return acc;
    },
    { all: 0, customer: 0, prospect: 0, won: 0, lost: 0 },
  );

  const visibleRows =
    state.filter === "all"
      ? state.rows
      : state.rows.filter((r) => r.tag === state.filter);

  return (
    <div className="wrap">
      <Header />
      <TopNav />

      <div className="hero">
        <h1>
          Tag the floor.
          <br />
          <span className="hl-blue">Customers and prospects.</span>
        </h1>
        <p>
          Paste a list of company names to bulk-tag. Tags are keyed by
          normalized name, so they survive enrichment-data reloads and apply
          across every event.
        </p>
      </div>

      <div className="bulk-tag">
        <div className="bulk-tag-title">Bulk tag</div>
        <textarea
          className="bulk-tag-textarea"
          placeholder="One company per line, or comma-separated.&#10;Acme Corp&#10;Beta Industries&#10;…"
          value={pasteText}
          onChange={(e) => setPasteText(e.target.value)}
          disabled={isApplying}
          rows={8}
        />
        <div className="bulk-tag-actions">
          <label className="bulk-tag-tag">
            <span>Tag as</span>
            <select
              className={`tag-picker tag-${pasteTag}`}
              value={pasteTag}
              onChange={(e) => setPasteTag(e.target.value as TagValue)}
              disabled={isApplying}
            >
              {TAG_VALUES.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </label>
          <span className="bulk-tag-count">
            {previewNames.length > 0
              ? `${previewNames.length} unique company name${previewNames.length === 1 ? "" : "s"} ready`
              : "Paste names above to begin"}
          </span>
          <button
            type="button"
            className="btn btn-primary"
            disabled={previewNames.length === 0 || isApplying}
            onClick={handleApply}
          >
            Apply tag
          </button>
        </div>
      </div>

      <StatusBox status={state.status} />

      <div className="results-section">
        <div className="results-header">
          <span className="results-title">Tagged companies</span>
          <span className="results-count">{state.rows.length}</span>
        </div>
        <div className="bulk-tag-filters">
          {(["all", ...TAG_VALUES] as Array<TagValue | "all">).map((t) => (
            <button
              key={t}
              type="button"
              className={`bulk-tag-filter${state.filter === t ? " active" : ""} bulk-tag-filter-${t}`}
              onClick={() => dispatch({ type: "FILTER", tag: t })}
            >
              {t} <span className="bulk-tag-filter-count">{counts[t]}</span>
            </button>
          ))}
        </div>
        {visibleRows.length === 0 ? (
          <div className="empty-state">
            {state.rows.length === 0
              ? "No tagged companies yet."
              : `No companies tagged as ${state.filter}.`}
          </div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Company</th>
                  <th>Country</th>
                  <th>Employees</th>
                  <th>Revenue</th>
                  <th>Industry</th>
                  <th>Tag</th>
                  <th>Updated</th>
                </tr>
              </thead>
              <tbody>
                {visibleRows.map((r) => (
                  <tr key={r.name_normalized}>
                    <td className="company-cell">{r.display_name}</td>
                    <td className="country-cell">{r.country ?? "—"}</td>
                    <td className="country-cell">
                      {formatEmployees(r.employees)}
                    </td>
                    <td className="country-cell">
                      {formatRevenueUsd(r.annual_revenue) ?? "—"}
                    </td>
                    <td className="industry-cell">{r.industry ?? "—"}</td>
                    <td>
                      <TagPicker
                        value={r.tag}
                        onChange={(t) =>
                          handleRowTagChange(r.name_normalized, t)
                        }
                      />
                    </td>
                    <td className="hall-cell">
                      {new Date(r.updated_at).toLocaleDateString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
