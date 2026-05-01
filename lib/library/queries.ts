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

export type CrossEventCompany = {
  name_normalized: string;
  display_name: string;
  events: { id: string; slug: string; name: string; year: number | null }[];
  country: string;
  employees: number | null;
  industry: string | null;
  apollo_matched: boolean;
};

type EeWithEvent = EeRow & { event_id: string };

type EventRef = {
  id: string;
  slug: string;
  name: string;
  year: number | null;
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

export function groupCrossEventCompanies(
  ees: EeWithEvent[],
  events: EventRef[],
  apollos: ApolloRow[],
): CrossEventCompany[] {
  const eventMap = new Map<string, EventRef>();
  for (const e of events) eventMap.set(e.id, e);

  const apolloMap = new Map<string, ApolloRow>();
  for (const a of apollos) apolloMap.set(a.name_normalized, a);

  type Bucket = {
    display_name: string;
    eventIds: Set<string>;
    countryFromEe: string;
  };
  const buckets = new Map<string, Bucket>();
  for (const ee of ees) {
    const existing = buckets.get(ee.name_normalized);
    if (existing) {
      existing.eventIds.add(ee.event_id);
      if (!existing.countryFromEe && ee.country) {
        existing.countryFromEe = ee.country;
      }
    } else {
      buckets.set(ee.name_normalized, {
        display_name: ee.raw_name,
        eventIds: new Set([ee.event_id]),
        countryFromEe: ee.country ?? "",
      });
    }
  }

  const out: CrossEventCompany[] = [];
  for (const [name_normalized, bucket] of buckets) {
    if (bucket.eventIds.size < 2) continue;
    const apollo = apolloMap.get(name_normalized);
    const eventRefs: EventRef[] = [];
    for (const id of bucket.eventIds) {
      const ref = eventMap.get(id);
      if (ref) eventRefs.push(ref);
    }
    eventRefs.sort((a, b) => {
      const ay = a.year ?? -Infinity;
      const by = b.year ?? -Infinity;
      if (ay !== by) return by - ay;
      return a.name.localeCompare(b.name);
    });
    out.push({
      name_normalized,
      display_name: bucket.display_name,
      events: eventRefs,
      country: bucket.countryFromEe || apollo?.country || "",
      employees: apollo?.employees ?? null,
      industry: apollo?.industry ?? null,
      apollo_matched: !!apollo,
    });
  }

  out.sort((a, b) => {
    if (a.events.length !== b.events.length)
      return b.events.length - a.events.length;
    return a.display_name.localeCompare(b.display_name);
  });
  return out;
}

export async function getCrossEventExhibitors(
  supabase: SupabaseClient = createServiceClient(),
): Promise<CrossEventCompany[]> {
  const { data: ees, error: eeErr } = await supabase
    .from("event_exhibitors")
    .select("raw_name, country, hall, booth, name_normalized, event_id");
  if (eeErr) throw new Error(`getCrossEventExhibitors ee: ${eeErr.message}`);
  if (!ees || ees.length === 0) return [];

  const { data: events, error: evErr } = await supabase
    .from("events")
    .select("id, slug, name, year");
  if (evErr) throw new Error(`getCrossEventExhibitors events: ${evErr.message}`);

  const normalized = Array.from(
    new Set(ees.map((r) => r.name_normalized as string)),
  );
  const { data: apollos, error: aErr } = await supabase
    .from("companies")
    .select("name_normalized, country, employees, industry")
    .in("name_normalized", normalized);
  if (aErr)
    throw new Error(`getCrossEventExhibitors apollo: ${aErr.message}`);

  return groupCrossEventCompanies(
    ees as EeWithEvent[],
    (events as EventRef[] | null) ?? [],
    (apollos as ApolloRow[] | null) ?? [],
  );
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
