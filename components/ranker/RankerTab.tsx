"use client";

import { useReducer, useRef } from "react";
import { parseCSV } from "@/lib/csv";
import { guessAllColumns } from "@/lib/columns";
import { parseSpreadsheet } from "@/lib/xlsx";
import { chunkText, extractPdfText } from "@/lib/pdf";
import {
  apiFetch,
  extractTextFromAnthropic,
} from "@/lib/api-client";
import { syncToDB } from "@/lib/company-db";
import { buildPdfExtractPrompt } from "@/lib/prompts";
import { ExtractedCompaniesSchema } from "@/lib/schemas";
import { runScoringPipeline } from "@/lib/scoring-pipeline";
import type {
  ColumnSelection,
  CountryWeights as CountryWeightsType,
  ParsedRow,
  RankedRow,
  Status,
} from "@/lib/types";
import { StatusBox } from "@/components/StatusBox";
import { UploadZone } from "./UploadZone";
import { ColumnPicker } from "./ColumnPicker";
import { CountryWeights } from "./CountryWeights";
import { TargetCountSlider } from "./TargetCountSlider";
import { ActionButtons } from "./ActionButtons";
import { ResultsTable } from "./ResultsTable";
import { SaveToLibrary } from "./SaveToLibrary";
import { saveEventFromCsv } from "@/app/library/actions";

type State = {
  parsedRows: ParsedRow[];
  headers: string[];
  fileName: string;
  countLabel: string | null;
  selection: ColumnSelection;
  countryWeights: CountryWeightsType;
  targetCount: number;
  rankedData: RankedRow[];
  status: Status;
  isScoring: boolean;
  isSaving: boolean;
  isSavingLibrary: boolean;
};

type Action =
  | {
      type: "FILE_PARSED";
      rows: ParsedRow[];
      headers: string[];
      fileName: string;
      countLabel: string | null;
      selection: ColumnSelection;
    }
  | { type: "SELECTION_CHANGED"; selection: ColumnSelection }
  | { type: "WEIGHTS_CHANGED"; weights: CountryWeightsType }
  | { type: "TARGET_CHANGED"; n: number }
  | { type: "STATUS"; status: Status }
  | { type: "SCORE_START" }
  | { type: "SCORE_SUCCESS"; data: RankedRow[] }
  | { type: "SCORE_END" }
  | { type: "SAVE_START" }
  | { type: "SAVE_END" }
  | { type: "SAVE_LIBRARY_START" }
  | { type: "SAVE_LIBRARY_END" };

const initialState: State = {
  parsedRows: [],
  headers: [],
  fileName: "",
  countLabel: null,
  selection: { name: "", country: "", hall: "" },
  countryWeights: {},
  targetCount: 50,
  rankedData: [],
  status: { kind: "idle" },
  isScoring: false,
  isSaving: false,
  isSavingLibrary: false,
};

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case "FILE_PARSED":
      return {
        ...state,
        parsedRows: action.rows,
        headers: action.headers,
        fileName: action.fileName,
        countLabel: action.countLabel,
        selection: action.selection,
        countryWeights: {},
        rankedData: [],
        status: { kind: "idle" },
      };
    case "SELECTION_CHANGED":
      return { ...state, selection: action.selection };
    case "WEIGHTS_CHANGED":
      return { ...state, countryWeights: action.weights };
    case "TARGET_CHANGED":
      return { ...state, targetCount: action.n };
    case "STATUS":
      return { ...state, status: action.status };
    case "SCORE_START":
      return { ...state, isScoring: true };
    case "SCORE_SUCCESS":
      return {
        ...state,
        rankedData: action.data,
        status: { kind: "idle" },
      };
    case "SCORE_END":
      return { ...state, isScoring: false };
    case "SAVE_START":
      return { ...state, isSaving: true };
    case "SAVE_END":
      return { ...state, isSaving: false };
    case "SAVE_LIBRARY_START":
      return { ...state, isSavingLibrary: true };
    case "SAVE_LIBRARY_END":
      return { ...state, isSavingLibrary: false };
  }
}

function csvEscape(v: string | number | null): string {
  if (v === null) return "";
  return String(v);
}

export function RankerTab() {
  const [state, dispatch] = useReducer(reducer, initialState);
  const resultsRef = useRef<HTMLDivElement>(null);

  const handleFile = async (file: File) => {
    const lower = file.name.toLowerCase();
    dispatch({
      type: "STATUS",
      status: { kind: "loading", message: "Reading file..." },
    });
    try {
      if (lower.endsWith(".pdf")) {
        await handlePdf(file);
        return;
      }
      if (lower.endsWith(".csv")) {
        const text = await file.text();
        const rows = parseCSV(text);
        finishParsedFile(rows, file.name);
        return;
      }
      const buffer = await file.arrayBuffer();
      const rows = await parseSpreadsheet(buffer);
      finishParsedFile(rows, file.name);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      dispatch({
        type: "STATUS",
        status: { kind: "error", message: "Parse error: " + message },
      });
    }
  };

  const finishParsedFile = (rows: ParsedRow[], fileName: string) => {
    if (!rows.length) {
      dispatch({
        type: "STATUS",
        status: { kind: "error", message: "No rows found." },
      });
      return;
    }
    const firstRow = rows[0];
    if (!firstRow) {
      dispatch({
        type: "STATUS",
        status: { kind: "error", message: "No rows found." },
      });
      return;
    }
    const headers = Object.keys(firstRow);
    const guess = guessAllColumns(headers);
    dispatch({
      type: "FILE_PARSED",
      rows,
      headers,
      fileName,
      countLabel: `${rows.length} rows`,
      selection: guess,
    });
  };

  const handlePdf = async (file: File) => {
    dispatch({
      type: "STATUS",
      status: {
        kind: "loading",
        message: "Reading PDF — extracting text...",
      },
    });
    try {
      const { text, pageCount } = await extractPdfText(file);
      if (!text.trim()) throw new Error("Could not extract text from PDF.");
      dispatch({
        type: "STATUS",
        status: {
          kind: "loading",
          message: `Extracting text from ${pageCount} pages...`,
        },
      });
      const chunks = chunkText(text, 12000, 500);
      dispatch({
        type: "STATUS",
        status: {
          kind: "loading",
          message: `Extracting companies from ${chunks.length} sections...`,
        },
      });

      let allCompanies: { name: string; country: string; booth: string }[] = [];
      for (let i = 0; i < chunks.length; i++) {
        const chunk = chunks[i];
        if (!chunk) continue;
        dispatch({
          type: "STATUS",
          status: {
            kind: "loading",
            message: `Extracting companies... (section ${i + 1} of ${chunks.length})`,
          },
        });
        try {
          const data = await apiFetch({
            model: "claude-haiku-4-5-20251001",
            max_tokens: 4000,
            prompt: buildPdfExtractPrompt(chunk, i + 1, chunks.length),
          });
          const responseText = extractTextFromAnthropic(data);
          const jsonMatch = responseText.match(/\{[\s\S]*\}/);
          if (jsonMatch) {
            const parsed: unknown = JSON.parse(jsonMatch[0]);
            const validated = ExtractedCompaniesSchema.parse(parsed);
            allCompanies = allCompanies.concat(validated.companies);
          }
        } catch {
          continue;
        }
      }

      const seen = new Set<string>();
      allCompanies = allCompanies.filter((c) => {
        if (!c.name || c.name.length < 2) return false;
        const key = c.name.toLowerCase().trim();
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });

      if (!allCompanies.length) {
        dispatch({
          type: "STATUS",
          status: { kind: "error", message: "No companies found in PDF." },
        });
        return;
      }

      const rows: ParsedRow[] = allCompanies.map((c) => ({
        Company: c.name,
        Country: c.country,
        Booth: c.booth,
      }));
      dispatch({
        type: "FILE_PARSED",
        rows,
        headers: ["Company", "Country", "Booth"],
        fileName: file.name,
        countLabel: `${allCompanies.length} companies found`,
        selection: { name: "Company", country: "Country", hall: "Booth" },
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      dispatch({
        type: "STATUS",
        status: { kind: "error", message: "PDF error: " + message },
      });
    }
  };

  const sourceName = (): string =>
    state.fileName.replace(/\.[^.]+$/, "") || "exporepoapi";

  const buildScoringRows = () => {
    const { name, country, hall } = state.selection;
    return state.parsedRows
      .map((r) => ({
        name: String(r[name] ?? "").trim(),
        country: country ? String(r[country] ?? "").trim() : "",
        hall: hall ? String(r[hall] ?? "").trim() : "",
      }))
      .filter((r) => r.name.length > 1);
  };

  const runScoring = async () => {
    if (!state.selection.name) {
      dispatch({
        type: "STATUS",
        status: {
          kind: "error",
          message: "Please select the company name column.",
        },
      });
      return;
    }
    const rows = buildScoringRows();
    if (!rows.length) {
      dispatch({
        type: "STATUS",
        status: { kind: "error", message: "No valid company names found." },
      });
      return;
    }

    dispatch({ type: "SCORE_START" });
    try {
      await runScoringPipeline(
        rows,
        {
          topN: state.targetCount,
          countryWeights: state.countryWeights,
          source: sourceName(),
        },
        {
          onStatus: (s) => dispatch({ type: "STATUS", status: s }),
          onResults: (data) => {
            dispatch({ type: "SCORE_SUCCESS", data });
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

  const saveToDBOnly = async () => {
    if (!state.selection.name) {
      dispatch({
        type: "STATUS",
        status: {
          kind: "error",
          message: "Please select the company name column.",
        },
      });
      return;
    }
    const { name, country } = state.selection;
    const rows = state.parsedRows
      .map((r) => ({
        name: String(r[name] ?? "").trim(),
        country: country ? String(r[country] ?? "").trim() : null,
      }))
      .filter((r) => r.name.length > 1);

    if (!rows.length) {
      dispatch({
        type: "STATUS",
        status: { kind: "error", message: "No valid company names found." },
      });
      return;
    }

    dispatch({ type: "SAVE_START" });
    dispatch({
      type: "STATUS",
      status: {
        kind: "loading",
        message: `Saving ${rows.length} companies to database...`,
      },
    });
    try {
      const result = await syncToDB(rows, sourceName());
      dispatch({
        type: "STATUS",
        status: {
          kind: "info",
          message: `✓ Saved to database — ${result.added} new, ${result.updated} updated (${result.total} total)`,
        },
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      dispatch({
        type: "STATUS",
        status: { kind: "error", message: "DB sync error: " + message },
      });
    } finally {
      dispatch({ type: "SAVE_END" });
    }
  };

  const saveToLibrary = async (meta: {
    name: string;
    slug: string;
    year: number | null;
  }) => {
    if (!state.selection.name) {
      dispatch({
        type: "STATUS",
        status: {
          kind: "error",
          message: "Please select the company name column.",
        },
      });
      return;
    }
    const { name: nameCol, country: countryCol, hall: hallCol } = state.selection;
    const rows = state.parsedRows
      .map((r) => ({
        raw_name: String(r[nameCol] ?? "").trim(),
        country: countryCol ? String(r[countryCol] ?? "").trim() : null,
        hall: hallCol ? String(r[hallCol] ?? "").trim() : null,
        booth: null as string | null,
      }))
      .filter((r) => r.raw_name.length > 1);
    if (!rows.length) {
      dispatch({
        type: "STATUS",
        status: { kind: "error", message: "No valid company names found." },
      });
      return;
    }

    dispatch({ type: "SAVE_LIBRARY_START" });
    dispatch({
      type: "STATUS",
      status: {
        kind: "loading",
        message: `Saving ${rows.length} exhibitors to Library as ${meta.slug}...`,
      },
    });
    try {
      const result = await saveEventFromCsv(
        {
          name: meta.name,
          slug: meta.slug,
          year: meta.year,
          source: "csv",
          source_url: null,
        },
        rows,
      );
      const dupNote =
        result.dupes_skipped > 0
          ? ` (${result.dupes_skipped} duplicates skipped)`
          : "";
      dispatch({
        type: "STATUS",
        status: {
          kind: "info",
          message: `✓ Saved to Library — ${result.exhibitor_count} exhibitors under "${result.slug}"${dupNote}`,
        },
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      dispatch({
        type: "STATUS",
        status: { kind: "error", message: "Library save failed: " + message },
      });
    } finally {
      dispatch({ type: "SAVE_LIBRARY_END" });
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
    a.download = `expotential_top${state.rankedData.length}_targets.csv`;
    a.click();
  };

  const showColSection = state.parsedRows.length > 0;

  return (
    <>
      <UploadZone onFile={handleFile} />

      {showColSection && (
        <div className="col-section">
          <div className="col-section-title">Map your columns</div>
          <ColumnPicker
            fileName={state.fileName}
            rowCount={state.parsedRows.length}
            countLabel={state.countLabel ?? undefined}
            headers={state.headers}
            selection={state.selection}
            onChange={(sel) =>
              dispatch({ type: "SELECTION_CHANGED", selection: sel })
            }
          />
          <CountryWeights
            rows={state.parsedRows}
            countryColumn={state.selection.country}
            weights={state.countryWeights}
            onChange={(w) => dispatch({ type: "WEIGHTS_CHANGED", weights: w })}
          />
          <TargetCountSlider
            value={state.targetCount}
            onChange={(n) => dispatch({ type: "TARGET_CHANGED", n })}
          />
          <ActionButtons
            isScoring={state.isScoring}
            isSaving={state.isSaving}
            onScore={runScoring}
            onSave={saveToDBOnly}
          />
          <SaveToLibrary
            defaultName={sourceName()}
            isSaving={state.isSavingLibrary}
            onSave={saveToLibrary}
          />
        </div>
      )}

      <StatusBox status={state.status} />

      {state.rankedData.length > 0 && (
        <div ref={resultsRef}>
          <ResultsTable data={state.rankedData} onDownload={downloadCSV} />
        </div>
      )}
    </>
  );
}
