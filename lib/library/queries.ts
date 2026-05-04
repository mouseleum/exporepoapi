import type { SupabaseClient } from "@supabase/supabase-js";
import { createServiceClient } from "../supabase";
import { normalizeName } from "../normalize";

export type EventListItem = {
  id: string;
  slug: string;
  name: string;
  year: number | null;
  scraped_at: string | null;
  exhibitor_count: number;
};

export const TAG_VALUES = ["customer", "prospect", "won", "lost"] as const;
export type TagValue = (typeof TAG_VALUES)[number];

export type LibraryExhibitor = {
  raw_name: string;
  name_normalized: string;
  country: string;
  hall: string;
  booth: string | null;
  employees: number | null;
  industry: string | null;
  apollo_matched: boolean;
  tag: TagValue | null;
};

export type CrossEventCompany = {
  name_normalized: string;
  display_name: string;
  events: { id: string; slug: string; name: string; year: number | null }[];
  country: string;
  employees: number | null;
  industry: string | null;
  apollo_matched: boolean;
  tag: TagValue | null;
};

type TagRow = { name_normalized: string; tag: TagValue };

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

export function tagsByName(tags: TagRow[]): Map<string, TagValue> {
  const m = new Map<string, TagValue>();
  for (const t of tags) m.set(t.name_normalized, t.tag);
  return m;
}

export function joinEventExhibitors(
  ees: EeRow[],
  apollos: ApolloRow[],
  tags: TagRow[] = [],
): LibraryExhibitor[] {
  const byName = new Map<string, ApolloRow>();
  for (const a of apollos) byName.set(a.name_normalized, a);
  const tagMap = tagsByName(tags);
  return ees.map((ee) => {
    const apollo = byName.get(ee.name_normalized);
    return {
      raw_name: ee.raw_name,
      name_normalized: ee.name_normalized,
      country: ee.country || apollo?.country || "",
      hall: ee.hall ?? "",
      booth: ee.booth,
      employees: apollo?.employees ?? null,
      industry: apollo?.industry ?? null,
      apollo_matched: !!apollo,
      tag: tagMap.get(ee.name_normalized) ?? null,
    };
  });
}

export function groupCrossEventCompanies(
  ees: EeWithEvent[],
  events: EventRef[],
  apollos: ApolloRow[],
  tags: TagRow[] = [],
): CrossEventCompany[] {
  const eventMap = new Map<string, EventRef>();
  for (const e of events) eventMap.set(e.id, e);

  const apolloMap = new Map<string, ApolloRow>();
  for (const a of apollos) apolloMap.set(a.name_normalized, a);

  const tagMap = tagsByName(tags);

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
      tag: tagMap.get(name_normalized) ?? null,
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
  const [apolloRes, tagsRes] = await Promise.all([
    supabase
      .from("companies")
      .select("name_normalized, country, employees, industry")
      .in("name_normalized", normalized),
    supabase
      .from("company_tags")
      .select("name_normalized, tag")
      .in("name_normalized", normalized),
  ]);
  if (apolloRes.error)
    throw new Error(`getCrossEventExhibitors apollo: ${apolloRes.error.message}`);
  if (tagsRes.error)
    throw new Error(`getCrossEventExhibitors tags: ${tagsRes.error.message}`);

  return groupCrossEventCompanies(
    ees as EeWithEvent[],
    (events as EventRef[] | null) ?? [],
    (apolloRes.data as ApolloRow[] | null) ?? [],
    (tagsRes.data as TagRow[] | null) ?? [],
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
  const [apolloRes, tagsRes] = await Promise.all([
    supabase
      .from("companies")
      .select("name_normalized, country, employees, industry")
      .in("name_normalized", normalized),
    supabase
      .from("company_tags")
      .select("name_normalized, tag")
      .in("name_normalized", normalized),
  ]);
  if (apolloRes.error)
    throw new Error(`getEventExhibitors apollo: ${apolloRes.error.message}`);
  if (tagsRes.error)
    throw new Error(`getEventExhibitors tags: ${tagsRes.error.message}`);

  return joinEventExhibitors(
    ees as EeRow[],
    (apolloRes.data as ApolloRow[] | null) ?? [],
    (tagsRes.data as TagRow[] | null) ?? [],
  );
}

export type SaveEventInput = {
  name: string;
  slug: string;
  year: number | null;
  source: string;
  source_url: string | null;
};

export type SaveEventRow = {
  raw_name: string;
  country?: string | null;
  hall?: string | null;
  booth?: string | null;
};

export type SaveEventResult = {
  event_id: string;
  slug: string;
  exhibitor_count: number;
  dupes_skipped: number;
};

export function dedupeForSave(rows: SaveEventRow[]): {
  rows: Array<SaveEventRow & { name_normalized: string }>;
  dupes: number;
} {
  const seen = new Set<string>();
  const out: Array<SaveEventRow & { name_normalized: string }> = [];
  let dupes = 0;
  for (const r of rows) {
    const raw = r.raw_name.trim();
    if (raw.length < 2) continue;
    const name_normalized = normalizeName(raw);
    if (!name_normalized) continue;
    if (seen.has(name_normalized)) {
      dupes++;
      continue;
    }
    seen.add(name_normalized);
    out.push({ ...r, raw_name: raw, name_normalized });
  }
  return { rows: out, dupes };
}

const SAVE_BATCH_SIZE = 500;

export async function saveEventWithExhibitors(
  meta: SaveEventInput,
  rows: SaveEventRow[],
  supabase: SupabaseClient = createServiceClient(),
): Promise<SaveEventResult> {
  const { rows: deduped, dupes } = dedupeForSave(rows);
  if (deduped.length === 0) {
    throw new Error("No valid exhibitor rows to save.");
  }

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
    throw new Error(`saveEvent events: ${eventErr?.message ?? "no row returned"}`);
  }
  const event_id = eventInsert.id as string;

  const eeRows = deduped.map((r) => ({
    event_id,
    raw_name: r.raw_name,
    name_normalized: r.name_normalized,
    country: r.country?.trim() || null,
    hall: r.hall?.trim() || null,
    booth: r.booth?.trim() || null,
  }));

  for (let i = 0; i < eeRows.length; i += SAVE_BATCH_SIZE) {
    const batch = eeRows.slice(i, i + SAVE_BATCH_SIZE);
    const { error } = await supabase
      .from("event_exhibitors")
      .upsert(batch, { onConflict: "event_id,name_normalized" });
    if (error) throw new Error(`saveEvent event_exhibitors: ${error.message}`);
  }

  return {
    event_id,
    slug: meta.slug,
    exhibitor_count: eeRows.length,
    dupes_skipped: dupes,
  };
}

export async function setCompanyTag(
  name_normalized: string,
  tag: TagValue | null,
  supabase: SupabaseClient = createServiceClient(),
): Promise<void> {
  if (tag === null) {
    const { error } = await supabase
      .from("company_tags")
      .delete()
      .eq("name_normalized", name_normalized);
    if (error) throw new Error(`setCompanyTag delete: ${error.message}`);
    return;
  }
  const { error } = await supabase
    .from("company_tags")
    .upsert(
      { name_normalized, tag, updated_at: new Date().toISOString() },
      { onConflict: "name_normalized" },
    );
  if (error) throw new Error(`setCompanyTag upsert: ${error.message}`);
}
