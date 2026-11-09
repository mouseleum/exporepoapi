// The ingestion half of getting an exhibitor list into the Library: upsert the
// event, dedupe the rows, write them in batches. Deliberately source-agnostic
// — it does not know or care whether the rows came from a site adapter or from
// a CSV a human downloaded off the fair's own page.
//
// Acquisition (finding and extracting a list) lives OUTSIDE this repo; the
// interface between the two halves is a list of rows. This module is the
// inside end of that interface.

import type { SupabaseClient } from "@supabase/supabase-js";
import { normalizeName } from "../normalize";

const BATCH_SIZE = 500;

export type ExhibitorInput = {
  raw_name: string;
  country?: string | null;
  hall?: string | null;
  booth?: string | null;
  source_id?: string | null;
};

export type IngestMeta = {
  source: string;
  slug: string;
  name: string;
  year: number | null;
  source_url: string | null;
};

export type IngestResult = {
  event_id: string;
  slug: string;
  fetched: number;
  upserted: number;
  dupes: number;
  // source_ids of the rows that survived deduping, in order. Only the adapter
  // path uses these (to map people back onto exhibitors); a CSV has none.
  source_ids: string[];
};

export async function ingestExhibitors(
  meta: IngestMeta,
  exhibitors: ExhibitorInput[],
  supabase: SupabaseClient,
): Promise<IngestResult> {
  const eventRow = {
    source: meta.source,
    slug: meta.slug,
    name: meta.name,
    year: meta.year,
    source_url: meta.source_url,
    scraped_at: new Date().toISOString(),
  };

  const { data: eventInsert, error: eventErr } = await supabase
    .from("events")
    .upsert(eventRow, { onConflict: "slug" })
    .select("id")
    .single();
  if (eventErr || !eventInsert) {
    throw new Error(
      `events upsert failed for ${meta.slug}: ${eventErr?.message ?? "no row returned"}`,
    );
  }
  const eventId = eventInsert.id as string;

  const seen = new Set<string>();
  const rows: Array<{
    event_id: string;
    raw_name: string;
    name_normalized: string;
    country: string | null;
    hall: string | null;
    booth: string | null;
    source_id: string | null;
  }> = [];
  let dupes = 0;
  for (const x of exhibitors) {
    const name_normalized = normalizeName(x.raw_name);
    if (seen.has(name_normalized)) {
      dupes++;
      continue;
    }
    seen.add(name_normalized);
    rows.push({
      event_id: eventId,
      raw_name: x.raw_name,
      name_normalized,
      country: x.country ?? null,
      hall: x.hall ?? null,
      booth: x.booth ?? null,
      source_id: x.source_id ?? null,
    });
  }

  let upserted = 0;
  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const batch = rows.slice(i, i + BATCH_SIZE);
    const { error } = await supabase
      .from("event_exhibitors")
      .upsert(batch, { onConflict: "event_id,name_normalized" });
    if (error) {
      throw new Error(
        `event_exhibitors upsert failed for ${meta.slug}: ${error.message}`,
      );
    }
    upserted += batch.length;
  }

  return {
    event_id: eventId,
    slug: meta.slug,
    fetched: exhibitors.length,
    upserted,
    dupes,
    source_ids: rows
      .map((r) => r.source_id)
      .filter((id): id is string => !!id),
  };
}
