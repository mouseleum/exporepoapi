"use client";

import { useEffect, useMemo, useReducer } from "react";
import { Header } from "@/components/Header";
import { TopNav } from "@/components/TopNav";
import { StatusBox } from "@/components/StatusBox";
import { FilterBar } from "@/components/library/FilterBar";
import { formatRevenueUsd } from "@/lib/library/format";
import { getCrossEventExhibitors } from "@/app/library/actions";
import type { CrossEventCompany } from "@/lib/library/queries";
import {
  applyFilter,
  type FilterState,
  type FilterTag,
} from "@/lib/library/filters";
import type { Status } from "@/lib/types";

type State = {
  rows: CrossEventCompany[];
  filter: FilterState;
  status: Status;
};

type Action =
  | { type: "ROWS_LOADED"; rows: CrossEventCompany[] }
  | { type: "FILTER_CHANGED"; filter: FilterState }
  | { type: "STATUS"; status: Status };

const initialState: State = {
  rows: [],
  filter: { tag: "all", search: "" },
  status: { kind: "idle" },
};

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case "ROWS_LOADED":
      return { ...state, rows: action.rows, status: { kind: "idle" } };
    case "FILTER_CHANGED":
      return { ...state, filter: action.filter };
    case "STATUS":
      return { ...state, status: action.status };
  }
}

function formatEmployees(n: number | null): string {
  if (n === null) return "—";
  return n.toLocaleString();
}

function formatEvent(e: { name: string; year: number | null }): string {
  return e.year ? `${e.name} ${e.year}` : e.name;
}

export default function ComparePage() {
  const [state, dispatch] = useReducer(reducer, initialState);

  useEffect(() => {
    let cancelled = false;
    dispatch({
      type: "STATUS",
      status: { kind: "loading", message: "Loading cross-event data…" },
    });
    getCrossEventExhibitors()
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

  const { rows } = state;

  const filterCounts = useMemo(() => {
    const c: Record<FilterTag, number> = {
      all: rows.length,
      untagged: 0,
      customer: 0,
      prospect: 0,
      won: 0,
      lost: 0,
    };
    for (const r of rows) {
      if (r.tag === null) c.untagged += 1;
      else c[r.tag] += 1;
    }
    return c;
  }, [rows]);

  const visibleRows = useMemo(
    () =>
      applyFilter(rows, state.filter, (r) => ({
        tag: r.tag,
        searchText: `${r.display_name} ${r.country} ${r.industry ?? ""}`,
      })),
    [rows, state.filter],
  );

  return (
    <div className="wrap">
      <Header />
      <TopNav />

      <div className="hero">
        <h1>
          Companies on
          <br />
          <span className="hl-blue">multiple floors.</span>
        </h1>
        <p>
          Exhibitors that appear at two or more events in the database.
          Enrichment data is merged in where available.{" "}
          <span className="event-attending-legend">
            <span className="event-attending">★ event</span> = my company is
            attending.
          </span>
        </p>
      </div>

      <StatusBox status={state.status} />

      {rows.length > 0 && (
        <div className="results-section">
          <div className="results-header">
            <span className="results-title">Cross-event exhibitors</span>
            <span className="results-count">
              {visibleRows.length !== rows.length
                ? `${visibleRows.length} / ${rows.length}`
                : rows.length}
            </span>
          </div>
          <FilterBar
            filter={state.filter}
            counts={filterCounts}
            onChange={(filter) => dispatch({ type: "FILTER_CHANGED", filter })}
          />
          {visibleRows.length === 0 ? (
            <div className="empty-state">
              No companies match the current filter.
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
                  <th>Events</th>
                </tr>
              </thead>
              <tbody>
                {visibleRows.map((r) => {
                  const attendingCount = r.events.filter(
                    (e) => e.romify_attending,
                  ).length;
                  return (
                    <tr key={r.name_normalized}>
                      <td className="company-cell">{r.display_name}</td>
                      <td className="country-cell">{r.country || "—"}</td>
                      <td className="country-cell">
                        {formatEmployees(r.employees)}
                      </td>
                      <td className="country-cell">
                        {formatRevenueUsd(r.annual_revenue) ?? "—"}
                      </td>
                      <td className="industry-cell">{r.industry ?? "—"}</td>
                      <td className="hall-cell">
                        {r.tag ? (
                          <span className={`tag-pill tag-${r.tag}`}>{r.tag}</span>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td className="hall-cell">
                        <span className="event-count-badge">
                          {r.events.length}
                          {attendingCount > 0 && (
                            <span className="event-attending-count">
                              {" "}
                              · {attendingCount}★
                            </span>
                          )}
                        </span>
                        <span className="event-list">
                          {r.events.map((e, i) => (
                            <span
                              key={e.id}
                              className={
                                e.romify_attending ? "event-attending" : ""
                              }
                            >
                              {e.romify_attending ? "★ " : ""}
                              {formatEvent(e)}
                              {i < r.events.length - 1 ? ", " : ""}
                            </span>
                          ))}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          )}
        </div>
      )}

      {state.status.kind === "idle" && rows.length === 0 && (
        <div className="empty-state">
          No companies appear at two or more events yet. Load another show
          with <code>pnpm load:event &lt;slug&gt;</code> to see overlap here.
        </div>
      )}
    </div>
  );
}
