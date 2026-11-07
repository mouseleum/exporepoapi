import type { SupabaseClient } from "@supabase/supabase-js";
import { createServiceClient } from "../supabase";

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

// source and adapter_config are no longer editable: a show's list comes from
// a CSV import, which sets source itself. The columns remain on the table,
// carrying their historical values for shows that were once scraped.
export type UpdateEventPatch = Partial<{
  slug: string;
  name: string;
  year: number | null;
  source_url: string | null;
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
