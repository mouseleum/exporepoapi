// CSV -> exhibitor rows, for the Library import path.
//
// The fair's own exhibitor list arrives here as a CSV produced outside this
// repo (a Claude skill, or the browser bookmarklet that runs on the fair's
// page). This module only maps columns; writing to the DB is
// lib/library/ingest-exhibitors.ts.

import { parseCSV } from "../csv";
import { guessExhibitorColumns, type ExhibitorColumns } from "../columns";
import type { ExhibitorInput } from "./ingest-exhibitors";

export type CsvExhibitorsResult = {
  rows: ExhibitorInput[];
  headers: string[];
  columns: ExhibitorColumns;
  // Rows dropped for having no usable company name. Reported rather than
  // silently swallowed: a mis-detected name column shows up as a large number
  // here instead of as a mysteriously short import.
  skippedNoName: number;
};

export function csvToExhibitors(text: string): CsvExhibitorsResult {
  const parsed = parseCSV(text);
  if (!parsed.length) {
    return {
      rows: [],
      headers: [],
      columns: { name: "", country: "", hall: "", booth: "" },
      skippedNoName: 0,
    };
  }

  const headers = Object.keys(parsed[0] ?? {});
  const columns = guessExhibitorColumns(headers);
  if (!columns.name) {
    throw new Error(
      `could not find a company name column. Looked for one of: company, ` +
        `exhibitor, name, organisation, firm. Headers found: ${headers.join(", ")}`,
    );
  }

  const pick = (row: Record<string, string>, col: string): string | null => {
    if (!col) return null;
    const v = String(row[col] ?? "").trim();
    return v === "" ? null : v;
  };

  const rows: ExhibitorInput[] = [];
  let skippedNoName = 0;
  for (const row of parsed) {
    const raw_name = String(row[columns.name] ?? "").trim();
    // Same threshold the Ranker uses: a single character is never a company.
    if (raw_name.length <= 1) {
      skippedNoName++;
      continue;
    }
    rows.push({
      raw_name,
      country: pick(row, columns.country),
      hall: pick(row, columns.hall),
      booth: pick(row, columns.booth),
      source_id: null,
    });
  }

  return { rows, headers, columns, skippedNoName };
}
