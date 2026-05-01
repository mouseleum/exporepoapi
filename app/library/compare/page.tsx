"use client";

import { useEffect, useReducer } from "react";
import { Header } from "@/components/Header";
import { TopNav } from "@/components/TopNav";
import { StatusBox } from "@/components/StatusBox";
import { getCrossEventExhibitors } from "@/app/library/actions";
import type { CrossEventCompany } from "@/lib/library/queries";
import type { Status } from "@/lib/types";

type State = {
  rows: CrossEventCompany[];
  status: Status;
};

type Action =
  | { type: "ROWS_LOADED"; rows: CrossEventCompany[] }
  | { type: "STATUS"; status: Status };

const initialState: State = {
  rows: [],
  status: { kind: "idle" },
};

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case "ROWS_LOADED":
      return { ...state, rows: action.rows, status: { kind: "idle" } };
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
          Exhibitors that appear at two or more events in the database. Apollo
          enrichment is merged in where available.
        </p>
      </div>

      <StatusBox status={state.status} />

      {rows.length > 0 && (
        <div className="results-section">
          <div className="results-header">
            <span className="results-title">Cross-event exhibitors</span>
            <span className="results-count">{rows.length}</span>
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Company</th>
                  <th>Country</th>
                  <th>Employees</th>
                  <th>Industry</th>
                  <th>Tag</th>
                  <th>Events</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.name_normalized}>
                    <td className="company-cell">{r.display_name}</td>
                    <td className="country-cell">{r.country || "—"}</td>
                    <td className="country-cell">
                      {formatEmployees(r.employees)}
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
                      </span>
                      <span className="event-list">
                        {r.events.map(formatEvent).join(", ")}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
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
