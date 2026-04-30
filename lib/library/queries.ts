import type { SupabaseClient } from "@supabase/supabase-js";
import { createServiceClient } from "../supabase";

export type EventListItem = {
  id: string;
  slug: string;
  name: string;
  year: number | null;
  scraped_at: string | null;
  exhibitor_count: number;
};

export type LibraryExhibitor = {
  raw_name: string;
  country: string;
  hall: string;
  booth: string | null;
  employees: number | null;
  industry: string | null;
  apollo_matched: boolean;
};

type EeRow = {
  raw_name: string;
  country: string | null;
  hall: string | null;
  booth: string | null;
  name_normalized: string;
};

type ApolloRow = {
  name_normalized: string;
  country: string | null;
  employees: number | null;
  industry: string | null;
};

export function joinEventExhibitors(
  ees: EeRow[],
  apollos: ApolloRow[],
): LibraryExhibitor[] {
  const byName = new Map<string, ApolloRow>();
  for (const a of apollos) byName.set(a.name_normalized, a);
  return ees.map((ee) => {
    const apollo = byName.get(ee.name_normalized);
    return {
      raw_name: ee.raw_name,
      country: ee.country || apollo?.country || "",
      hall: ee.hall ?? "",
      booth: ee.booth,
      employees: apollo?.employees ?? null,
      industry: apollo?.industry ?? null,
      apollo_matched: !!apollo,
    };
  });
}

export async function listEvents(
  supabase: SupabaseClient = createServiceClient(),
): Promise<EventListItem[]> {
  const { data: events, error } = await supabase
    .from("events")
    .select("id, slug, name, year, scraped_at")
    .order("year", { ascending: false })
    .order("name", { ascending: true });
  if (error) throw new Error(`listEvents: ${error.message}`);
  if (!events) return [];

  const counts = await Promise.all(
    events.map(async (e) => {
      const { count } = await supabase
        .from("event_exhibitors")
        .select("*", { count: "exact", head: true })
        .eq("event_id", e.id as string);
      return [e.id as string, count ?? 0] as const;
    }),
  );
  const countMap = new Map(counts);

  return events.map((e) => ({
    id: e.id as string,
    slug: e.slug as string,
    name: e.name as string,
    year: (e.year as number | null) ?? null,
    scraped_at: (e.scraped_at as string | null) ?? null,
    exhibitor_count: countMap.get(e.id as string) ?? 0,
  }));
}

export async function getEventExhibitors(
  eventId: string,
  supabase: SupabaseClient = createServiceClient(),
): Promise<LibraryExhibitor[]> {
  const { data: ees, error: eeErr } = await supabase
    .from("event_exhibitors")
    .select("raw_name, country, hall, booth, name_normalized")
    .eq("event_id", eventId)
    .order("raw_name", { ascending: true });
  if (eeErr) throw new Error(`getEventExhibitors: ${eeErr.message}`);
  if (!ees || ees.length === 0) return [];

  const normalized = ees.map((r) => r.name_normalized as string);
  const { data: apollos, error: aErr } = await supabase
    .from("companies")
    .select("name_normalized, country, employees, industry")
    .in("name_normalized", normalized);
  if (aErr) throw new Error(`getEventExhibitors apollo: ${aErr.message}`);

  return joinEventExhibitors(
    ees as EeRow[],
    (apollos as ApolloRow[] | null) ?? [],
  );
}
