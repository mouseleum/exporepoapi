"use client";

import { useEffect, useMemo, useReducer, useRef } from "react";
import { Header } from "@/components/Header";
import { TopNav } from "@/components/TopNav";
import { StatusBox } from "@/components/StatusBox";
import { CountryWeights } from "@/components/ranker/CountryWeights";
import { TargetCountSlider } from "@/components/ranker/TargetCountSlider";
import { ResultsTable } from "@/components/ranker/ResultsTable";
import { EventPicker } from "@/components/library/EventPicker";
import { ExhibitorPreview } from "@/components/library/ExhibitorPreview";
import {
  listEvents,
  getEventExhibitors,
  setCompanyTag,
} from "@/app/library/actions";
import { runScoringPipeline } from "@/lib/scoring-pipeline";
import {
  loadScoringCache,
  saveScoringCache,
  clearScoringCache,
} from "@/lib/library/scoring-cache";
import type {
  EventListItem,
  LibraryExhibitor,
  TagValue,
} from "@/lib/library/queries";
import type {
  CountryWeights as CountryWeightsType,
  EnrichedCompany,
  ParsedRow,
  RankedRow,
  Status,
} from "@/lib/types";

type State = {
  events: EventListItem[];
  selectedId: string | null;
  exhibitors: LibraryExhibitor[];
  countryWeights: CountryWeightsType;
  targetCount: number;
  rankedData: RankedRow[];
  cachedScoredAt: string | null;
  isScoring: boolean;
  status: Status;
};

type Action =
  | { type: "EVENTS_LOADED"; events: EventListItem[] }
  | { type: "EVENT_SELECTED"; id: string }
  | { type: "EXHIBITORS_LOADED"; exhibitors: LibraryExhibitor[] }
  | {
      type: "CACHE_HYDRATED";
      ranked: RankedRow[];
      weights: CountryWeightsType;
      targetCount: number;
      scoredAt: string;
    }
  | { type: "TAG_UPDATED"; name_normalized: string; tag: TagValue | null }
  | { type: "WEIGHTS_CHANGED"; weights: CountryWeightsType }
  | { type: "TARGET_CHANGED"; n: number }
  | { type: "STATUS"; status: Status }
  | { type: "SCORE_START" }
  | { type: "SCORE_SUCCESS"; data: RankedRow[] }
  | { type: "SCORE_END" };

const initialState: State = {
  events: [],
  selectedId: null,
  exhibitors: [],
  countryWeights: {},
  targetCount: 50,
  rankedData: [],
  cachedScoredAt: null,
  isScoring: false,
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
        countryWeights: {},
        rankedData: [],
        cachedScoredAt: null,
      };
    case "EXHIBITORS_LOADED":
      return {
        ...state,
        exhibitors: action.exhibitors,
        status: { kind: "idle" },
      };
    case "CACHE_HYDRATED":
      return {
        ...state,
        rankedData: action.ranked,
        countryWeights: action.weights,
        targetCount: action.targetCount,
        cachedScoredAt: action.scoredAt,
      };
    case "TAG_UPDATED":
      return {
        ...state,
        exhibitors: state.exhibitors.map((e) =>
          e.name_normalized === action.name_normalized
            ? { ...e, tag: action.tag }
            : e,
        ),
      };
    case "WEIGHTS_CHANGED":
      return { ...state, countryWeights: action.weights };
    case "TARGET_CHANGED":
      return { ...state, targetCount: action.n };
    case "STATUS":
      return { ...state, status: action.status };
    case "SCORE_START":
      return {
        ...state,
        isScoring: true,
        rankedData: [],
        cachedScoredAt: null,
      };
    case "SCORE_SUCCESS":
      return {
        ...state,
        rankedData: action.data,
        status: { kind: "idle" },
      };
    case "SCORE_END":
      return { ...state, isScoring: false };
  }
}

function csvEscape(v: string | number | null): string {
  if (v === null) return "";
  return String(v);
}

export default function LibraryPage() {
  const [state, dispatch] = useReducer(reducer, initialState);
  const resultsRef = useRef<HTMLDivElement>(null);

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
        const cached = loadScoringCache(id);
        if (cached) {
          dispatch({
            type: "CACHE_HYDRATED",
            ranked: cached.ranked,
            weights: cached.weights,
            targetCount: cached.targetCount,
            scoredAt: cached.scoredAt,
          });
        }
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

  const weightRows: ParsedRow[] = useMemo(
    () => state.exhibitors.map((e) => ({ country: e.country })),
    [state.exhibitors],
  );

  const selectedEvent = state.events.find((e) => e.id === state.selectedId);

  const handleTagChange = async (
    name_normalized: string,
    tag: TagValue | null,
  ) => {
    const prev =
      state.exhibitors.find((e) => e.name_normalized === name_normalized)?.tag ??
      null;
    dispatch({ type: "TAG_UPDATED", name_normalized, tag });
    try {
      await setCompanyTag(name_normalized, tag);
    } catch (err) {
      dispatch({ type: "TAG_UPDATED", name_normalized, tag: prev });
      const message = err instanceof Error ? err.message : String(err);
      dispatch({
        type: "STATUS",
        status: { kind: "error", message: "Tag save failed: " + message },
      });
    }
  };

  const runScoring = async () => {
    if (!state.exhibitors.length) return;
    const event = selectedEvent;
    if (!event) return;

    const rows = state.exhibitors.map((e) => ({
      name: e.raw_name,
      country: e.country,
      hall: e.hall,
    }));

    const prefilledEnriched: Record<string, EnrichedCompany> = {};
    for (const e of state.exhibitors) {
      if (!e.apollo_matched) continue;
      const key = e.raw_name.toLowerCase().trim();
      prefilledEnriched[key] = {
        name: e.raw_name,
        matched: true,
        employee_count: e.employees,
        employee_range: null,
        industry: e.industry,
        revenue_range: null,
        founded: null,
        linkedin_url: null,
        tags: [],
      };
    }

    dispatch({ type: "SCORE_START" });
    try {
      await runScoringPipeline(
        rows,
        {
          topN: state.targetCount,
          countryWeights: state.countryWeights,
          source: event.slug,
          prefilledEnriched,
        },
        {
          onStatus: (s) => dispatch({ type: "STATUS", status: s }),
          onResults: (data) => {
            dispatch({ type: "SCORE_SUCCESS", data });
            saveScoringCache(event.id, {
              ranked: data,
              weights: state.countryWeights,
              targetCount: state.targetCount,
              scoredAt: new Date().toISOString(),
            });
            requestAnimationFrame(() => {
              resultsRef.current?.scrollIntoView({
                behavior: "smooth",
                block: "start",
              });
            });
          },
        },
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      dispatch({
        type: "STATUS",
        status: { kind: "error", message: "Error: " + message },
      });
    } finally {
      dispatch({ type: "SCORE_END" });
    }
  };

  const downloadCSV = () => {
    if (!state.rankedData.length) return;
    const header = "Rank,Company,Country,Hall/Booth,Employees,Industry,Score\n";
    const rows = state.rankedData
      .map(
        (r) =>
          `${r.rank},"${csvEscape(r.name)}","${csvEscape(r.country)}","${csvEscape(r.hall)}","${csvEscape(
            r.employees,
          )}","${csvEscape(r.industry)}",${r.score}`,
      )
      .join("\n");
    const blob = new Blob([header + rows], { type: "text/csv" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    const slug = selectedEvent?.slug ?? "library";
    a.download = `expotential_${slug}_top${state.rankedData.length}.csv`;
    a.click();
  };

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

      {state.exhibitors.length > 0 && (
        <div className="col-section">
          <CountryWeights
            rows={weightRows}
            countryColumn="country"
            weights={state.countryWeights}
            onChange={(w) =>
              dispatch({ type: "WEIGHTS_CHANGED", weights: w })
            }
          />
          <TargetCountSlider
            value={state.targetCount}
            onChange={(n) => dispatch({ type: "TARGET_CHANGED", n })}
          />
          <button
            type="button"
            className="btn btn-primary"
            disabled={state.isScoring}
            onClick={runScoring}
          >
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
            >
              <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
            </svg>
            Score with AI
          </button>
        </div>
      )}

      {state.exhibitors.length > 0 && (
        <ExhibitorPreview
          exhibitors={state.exhibitors}
          onTagChange={handleTagChange}
        />
      )}

      <StatusBox status={state.status} />

      {state.rankedData.length > 0 && (
        <div ref={resultsRef}>
          {state.cachedScoredAt && (
            <div className="cache-banner">
              <span>
                Showing scored results from{" "}
                {new Date(state.cachedScoredAt).toLocaleString()} (cached
                locally).
              </span>
              <button
                type="button"
                className="cache-banner-btn"
                disabled={state.isScoring}
                onClick={() => {
                  if (state.selectedId) clearScoringCache(state.selectedId);
                  void runScoring();
                }}
              >
                Re-score
              </button>
            </div>
          )}
          <ResultsTable data={state.rankedData} onDownload={downloadCSV} />
        </div>
      )}
    </div>
  );
}
