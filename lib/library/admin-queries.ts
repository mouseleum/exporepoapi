import type { SupabaseClient } from "@supabase/supabase-js";
import { createServiceClient } from "../supabase";
import { getAdapterFactory } from "../adapters/registry";
import { loadEventForRow, type EventRow, type LoadEventResult } from "./load-event";

export type AdminEventRow = {
  id: string;
  source: string;
  slug: string;
  name: string;
  year: number | null;
  source_url: string | null;
  adapter_config: unknown;
  romify_attending: boolean;
  scraped_at: string | null;
  exhibitor_count: number;
  people_count: number;
};

export type CreateEventInput = {
  source: string;
  slug: string;
  name: string;
  year: number | null;
  source_url: string | null;
  adapter_config: unknown;
  romify_attending: boolean;
};

export type UpdateEventPatch = Partial<{
  source: string;
  slug: string;
  name: string;
  year: number | null;
  source_url: string | null;
  adapter_config: unknown;
  romify_attending: boolean;
}>;

export async function listAllAdminEvents(
  supabase: SupabaseClient = createServiceClient(),
): Promise<AdminEventRow[]> {
  const { data: events, error } = await supabase
    .from("events")
    .select(
      "id, source, slug, name, year, source_url, adapter_config, romify_attending, scraped_at",
    )
    .order("year", { ascending: false })
    .order("name", { ascending: true });
  if (error) throw new Error(`listAllAdminEvents: ${error.message}`);
  if (!events) return [];

  const counts = await Promise.all(
    events.map(async (e) => {
      const id = e.id as string;
      const [exhRes, peopleRes] = await Promise.all([
        supabase
          .from("event_exhibitors")
          .select("*", { count: "exact", head: true })
          .eq("event_id", id),
        supabase
          .from("event_exhibitor_people")
          .select("event_exhibitor_id, event_exhibitors!inner(event_id)", {
            count: "exact",
            head: true,
          })
          .eq("event_exhibitors.event_id", id),
      ]);
      return [id, exhRes.count ?? 0, peopleRes.count ?? 0] as const;
    }),
  );
  const exhMap = new Map(counts.map((c) => [c[0], c[1]]));
  const peopleMap = new Map(counts.map((c) => [c[0], c[2]]));

  return events.map((e) => ({
    id: e.id as string,
    source: e.source as string,
    slug: e.slug as string,
    name: e.name as string,
    year: (e.year as number | null) ?? null,
    source_url: (e.source_url as string | null) ?? null,
    adapter_config: e.adapter_config ?? {},
    romify_attending: !!e.romify_attending,
    scraped_at: (e.scraped_at as string | null) ?? null,
    exhibitor_count: exhMap.get(e.id as string) ?? 0,
    people_count: peopleMap.get(e.id as string) ?? 0,
  }));
}

export async function createEvent(
  input: CreateEventInput,
  supabase: SupabaseClient = createServiceClient(),
): Promise<{ id: string }> {
  if (!input.slug || !input.slug.trim()) {
    throw new Error("createEvent: slug is required");
  }
  if (!input.source || !input.source.trim()) {
    throw new Error("createEvent: source is required");
  }
  const { data, error } = await supabase
    .from("events")
    .insert({
      source: input.source,
      slug: input.slug,
      name: input.name,
      year: input.year,
      source_url: input.source_url,
      adapter_config: input.adapter_config ?? {},
      romify_attending: input.romify_attending,
    })
    .select("id")
    .single();
  if (error || !data) {
    const msg = error?.message ?? "no row returned";
    if (error?.code === "23505" || /duplicate key|already exists/i.test(msg)) {
      throw new Error(
        `Slug '${input.slug}' already exists — edit/fetch the existing row instead of adding a new one.`,
      );
    }
    throw new Error(`createEvent: ${msg}`);
  }
  return { id: data.id as string };
}

export async function updateEvent(
  id: string,
  patch: UpdateEventPatch,
  supabase: SupabaseClient = createServiceClient(),
): Promise<void> {
  if (!id) throw new Error("updateEvent: id is required");
  if (Object.keys(patch).length === 0) return;
  const { error } = await supabase.from("events").update(patch).eq("id", id);
  if (error) throw new Error(`updateEvent: ${error.message}`);
}

export async function deleteEvent(
  id: string,
  supabase: SupabaseClient = createServiceClient(),
): Promise<void> {
  if (!id) throw new Error("deleteEvent: id is required");
  const { error } = await supabase.from("events").delete().eq("id", id);
  if (error) throw new Error(`deleteEvent: ${error.message}`);
}

export async function triggerEventFetch(
  id: string,
  supabase: SupabaseClient = createServiceClient(),
): Promise<LoadEventResult> {
  const { data, error } = await supabase
    .from("events")
    .select("source, slug, name, year, source_url, adapter_config")
    .eq("id", id)
    .single();
  if (error || !data) {
    throw new Error(`triggerEventFetch lookup: ${error?.message ?? "not found"}`);
  }
  const row = data as EventRow;
  if (!getAdapterFactory(row.source)) {
    throw new Error(
      `triggerEventFetch: no adapter family registered for source '${row.source}'`,
    );
  }
  return loadEventForRow(row, supabase);
}
