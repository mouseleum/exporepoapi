import type { SupabaseClient } from "@supabase/supabase-js";
import type { Adapter, AdapterFactory, EventMeta } from "../adapters/types";
import { ADAPTER_FACTORIES } from "../adapters/registry";
import { normalizeName } from "../normalize";

const BATCH_SIZE = 500;

export type LoadEventResult = {
  slug: string;
  fetched: number;
  upserted: number;
  dupes: number;
  people_upserted?: number;
  elapsed_ms: number;
};

export type LoadEventOptions = {
  includePeople?: boolean;
};

export type EventRow = {
  source: string;
  slug: string;
  name: string;
  year: number | null;
  source_url: string | null;
  adapter_config: unknown;
};

function rowToMeta(row: EventRow): EventMeta {
  return {
    source: row.source,
    slug: row.slug,
    name: row.name,
    year: row.year,
    source_url: row.source_url ?? "",
  };
}

export function buildAdapterForRow(
  row: EventRow,
  factories: Record<string, AdapterFactory> = ADAPTER_FACTORIES,
): Adapter {
  const factory = factories[row.source];
  if (!factory) {
    throw new Error(
      `no adapter family registered for source '${row.source}' (slug=${row.slug})`,
    );
  }
  return factory(rowToMeta(row), row.adapter_config ?? {});
}

export async function loadEventForRow(
  row: EventRow,
  supabase: SupabaseClient,
  factories: Record<string, AdapterFactory> = ADAPTER_FACTORIES,
): Promise<LoadEventResult> {
  const adapter = buildAdapterForRow(row, factories);
  const cfg = (row.adapter_config ?? {}) as { includePeople?: boolean };
  return loadEventForAdapter(adapter, supabase, {
    includePeople: !!cfg.includePeople,
  });
}

export async function loadEventForAdapter(
  adapter: Adapter,
  supabase: SupabaseClient,
  options: LoadEventOptions = {},
): Promise<LoadEventResult> {
  const start = Date.now();

  const exhibitors = await adapter.fetch();

  const eventRow = {
    source: adapter.meta.source,
    slug: adapter.meta.slug,
    name: adapter.meta.name,
    year: adapter.meta.year,
    source_url: adapter.meta.source_url,
    scraped_at: new Date().toISOString(),
  };

  const { data: eventInsert, error: eventErr } = await supabase
    .from("events")
    .upsert(eventRow, { onConflict: "slug" })
    .select("id")
    .single();
  if (eventErr || !eventInsert) {
    throw new Error(
      `events upsert failed for ${adapter.meta.slug}: ${eventErr?.message ?? "no row returned"}`,
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
        `event_exhibitors upsert failed for ${adapter.meta.slug}: ${error.message}`,
      );
    }
    upserted += batch.length;
  }

  let people_upserted: number | undefined;
  if (options.includePeople && adapter.fetchPeople) {
    people_upserted = await loadPeopleForEvent(
      eventId,
      adapter,
      rows
        .map((r) => r.source_id)
        .filter((id): id is string => !!id),
      supabase,
    );
  }

  return {
    slug: adapter.meta.slug,
    fetched: exhibitors.length,
    upserted,
    dupes,
    people_upserted,
    elapsed_ms: Date.now() - start,
  };
}

async function loadPeopleForEvent(
  eventId: string,
  adapter: Adapter,
  exhibitorSourceIds: string[],
  supabase: SupabaseClient,
): Promise<number> {
  if (!adapter.fetchPeople || exhibitorSourceIds.length === 0) return 0;

  // Map each source_id → event_exhibitor.id so people FK back cleanly.
  const { data: exhRows, error: exhErr } = await supabase
    .from("event_exhibitors")
    .select("id, source_id")
    .eq("event_id", eventId)
    .not("source_id", "is", null);
  if (exhErr) {
    throw new Error(
      `event_exhibitors lookup failed for ${adapter.meta.slug}: ${exhErr.message}`,
    );
  }
  const idBySourceId = new Map<string, string>();
  for (const r of exhRows ?? []) {
    if (r.source_id) idBySourceId.set(r.source_id as string, r.id as string);
  }

  const people = await adapter.fetchPeople(exhibitorSourceIds);
  const peopleRows: Array<{
    event_exhibitor_id: string;
    source_person_id: string | null;
    raw_name: string;
    first_name: string | null;
    last_name: string | null;
    job_title: string | null;
    organization: string | null;
    photo_url: string | null;
  }> = [];
  for (const p of people) {
    const exhId = idBySourceId.get(p.source_exhibitor_id);
    if (!exhId) continue;
    peopleRows.push({
      event_exhibitor_id: exhId,
      source_person_id: p.source_person_id ?? null,
      raw_name: p.raw_name,
      first_name: p.first_name ?? null,
      last_name: p.last_name ?? null,
      job_title: p.job_title ?? null,
      organization: p.organization ?? null,
      photo_url: p.photo_url ?? null,
    });
  }

  let upserted = 0;
  for (let i = 0; i < peopleRows.length; i += BATCH_SIZE) {
    const batch = peopleRows.slice(i, i + BATCH_SIZE);
    const { error } = await supabase
      .from("event_exhibitor_people")
      .upsert(batch, { onConflict: "event_exhibitor_id,source_person_id" });
    if (error) {
      throw new Error(
        `event_exhibitor_people upsert failed for ${adapter.meta.slug}: ${error.message}`,
      );
    }
    upserted += batch.length;
  }
  return upserted;
}
