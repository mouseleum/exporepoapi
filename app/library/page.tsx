"use client";

import { useEffect, useReducer } from "react";
import { Header } from "@/components/Header";
import { TopNav } from "@/components/TopNav";
import { StatusBox } from "@/components/StatusBox";
import { EventPicker } from "@/components/library/EventPicker";
import { ExhibitorPreview } from "@/components/library/ExhibitorPreview";
import {
  listEvents,
  getEventExhibitors,
} from "@/app/library/actions";
import type {
  EventListItem,
  LibraryExhibitor,
} from "@/lib/library/queries";
import type { Status } from "@/lib/types";

type State = {
  events: EventListItem[];
  selectedId: string | null;
  exhibitors: LibraryExhibitor[];
  status: Status;
};

type Action =
  | { type: "EVENTS_LOADED"; events: EventListItem[] }
  | { type: "EVENT_SELECTED"; id: string }
  | { type: "EXHIBITORS_LOADED"; exhibitors: LibraryExhibitor[] }
  | { type: "STATUS"; status: Status };

const initialState: State = {
  events: [],
  selectedId: null,
  exhibitors: [],
  status: { kind: "idle" },
};

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case "EVENTS_LOADED":
      return { ...state, events: action.events };
    case "EVENT_SELECTED":
      return {
        ...state,
        selectedId: action.id,
        exhibitors: [],
      };
    case "EXHIBITORS_LOADED":
      return {
        ...state,
        exhibitors: action.exhibitors,
        status: { kind: "idle" },
      };
    case "STATUS":
      return { ...state, status: action.status };
  }
}

export default function LibraryPage() {
  const [state, dispatch] = useReducer(reducer, initialState);

  useEffect(() => {
    let cancelled = false;
    dispatch({
      type: "STATUS",
      status: { kind: "loading", message: "Loading events…" },
    });
    listEvents()
      .then((events) => {
        if (cancelled) return;
        dispatch({ type: "EVENTS_LOADED", events });
        dispatch({ type: "STATUS", status: { kind: "idle" } });
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        const message = err instanceof Error ? err.message : String(err);
        dispatch({
          type: "STATUS",
          status: { kind: "error", message: "Failed to load events: " + message },
        });
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!state.selectedId) return;
    let cancelled = false;
    const id = state.selectedId;
    dispatch({
      type: "STATUS",
      status: { kind: "loading", message: "Loading exhibitors…" },
    });
    getEventExhibitors(id)
      .then((exhibitors) => {
        if (cancelled) return;
        dispatch({ type: "EXHIBITORS_LOADED", exhibitors });
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        const message = err instanceof Error ? err.message : String(err);
        dispatch({
          type: "STATUS",
          status: {
            kind: "error",
            message: "Failed to load exhibitors: " + message,
          },
        });
      });
    return () => {
      cancelled = true;
    };
  }, [state.selectedId]);

  return (
    <div className="wrap">
      <Header />
      <TopNav />

      <div className="hero">
        <h1>
          Pick a show.
          <br />
          <span className="hl-blue">Score the floor.</span>
        </h1>
        <p>
          Browse events from the database, see which exhibitors are already
          enriched from Apollo, then score the list.
        </p>
      </div>

      <EventPicker
        events={state.events}
        selectedId={state.selectedId}
        onChange={(id) => dispatch({ type: "EVENT_SELECTED", id })}
      />

      <StatusBox status={state.status} />

      {state.exhibitors.length > 0 && (
        <ExhibitorPreview exhibitors={state.exhibitors} />
      )}
    </div>
  );
}
