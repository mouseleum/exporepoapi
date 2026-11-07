// Import an exhibitor list into the Library from a CSV.
//
// This is the inside end of the acquisition boundary: lists are found and
// extracted outside this repo, and arrive as a CSV file. Nothing here fetches
// anything over the network.

import type { SupabaseClient } from "@supabase/supabase-js";
import { createServiceClient } from "../supabase";
import { csvToExhibitors } from "./csv-exhibitors";
import { ingestExhibitors } from "./ingest-exhibitors";
import type { ExhibitorColumns } from "../columns";
import { CSV_SOURCE } from "./event-source";

export { CSV_SOURCE } from "./event-source";

export type ImportEventCsvInput = {
  slug: string;
  name: string;
  year: number | null;
  source_url?: string | null;
  csvText: string;
};

export type ImportEventCsvResult = {
  event_id: string;
  slug: string;
  imported: number;
  dupes: number;
  skippedNoName: number;
  columns: ExhibitorColumns;
};

export async function importEventCsv(
  input: ImportEventCsvInput,
  supabase: SupabaseClient = createServiceClient(),
): Promise<ImportEventCsvResult> {
  const slug = input.slug.trim();
  const name = input.name.trim();
  if (!slug) throw new Error("importEventCsv: slug is required");
  if (!name) throw new Error("importEventCsv: name is required");
  if (!input.csvText.trim()) throw new Error("importEventCsv: the CSV is empty");

  // Don't let a CSV import silently take over a show that was scraped before
  // acquisition moved out of this repo. ingestExhibitors upserts on slug, so
  // without this the row's historical source would be rewritten to "csv" and
  // the only record of where that list came from would be lost.
  const { data: existing, error: existingErr } = await supabase
    .from("events")
    .select("source")
    .eq("slug", slug)
    .maybeSingle();
  if (existingErr) {
    throw new Error(`events lookup failed for ${slug}: ${existingErr.message}`);
  }
  if (existing && existing.source !== CSV_SOURCE) {
    throw new Error(
      `'${slug}' already exists as a ${String(existing.source)} event. ` +
        `Importing a CSV over it would overwrite that record — ` +
        `use a different slug, or delete that event first.`,
    );
  }

  const { rows, columns, skippedNoName } = csvToExhibitors(input.csvText);
  if (!rows.length) {
    throw new Error(
      `no exhibitors found in the CSV (${skippedNoName} row(s) had no usable ` +
        `company name in column '${columns.name}')`,
    );
  }

  const ingested = await ingestExhibitors(
    {
      source: CSV_SOURCE,
      slug,
      name,
      year: input.year,
      source_url: input.source_url?.trim() || null,
    },
    rows,
    supabase,
  );

  return {
    event_id: ingested.event_id,
    slug: ingested.slug,
    imported: ingested.upserted,
    dupes: ingested.dupes,
    skippedNoName,
    columns,
  };
}
