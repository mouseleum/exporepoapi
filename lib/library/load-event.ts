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
  elapsed_ms: number;
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
  return loadEventForAdapter(adapter, supabase);
}

export async function loadEventForAdapter(
  adapter: Adapter,
  supabase: SupabaseClient,
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

  return {
    slug: adapter.meta.slug,
    fetched: exhibitors.length,
    upserted,
    dupes,
    elapsed_ms: Date.now() - start,
  };
}
