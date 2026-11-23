// expo-calendar-mcp — read-only MCP server over calendar_shows.
//
// URL:  https://hihhgpzcklusonxnbfcn.supabase.co/functions/v1/expo-calendar-mcp
// Deploy with JWT verification off (public, no sign-in):
//   supabase functions deploy --no-verify-jwt expo-calendar-mcp
//
// Guardrails (spec 2.3):
// - Uses the anon key only and relies on RLS (calendar_shows: select-only).
// - Reads calendar_shows only — directly, or through calendar_search_shows /
//   calendar_facets, which are security-invoker SQL functions over that table.
// - Every input is validated with zod; unknown fields are rejected.
// - Max 50 rows per call (100 for find_overlaps).
// - Logs tool name, duration and row count only.
// Built from Supabase's "Deploy MCP servers" guide (MCP TypeScript SDK +
// WebStandardStreamableHTTPServerTransport + Hono), checked 23 Nov 2026.
import 'jsr:@supabase/functions-js/edge-runtime.d.ts';

import { McpServer } from 'npm:@modelcontextprotocol/sdk@1.25.3/server/mcp.js';
import { WebStandardStreamableHTTPServerTransport } from 'npm:@modelcontextprotocol/sdk@1.25.3/server/webStandardStreamableHttp.js';
import { Hono } from 'npm:hono@4.9.7';
import { z } from 'npm:zod@4.1.13';
import { createClient } from 'npm:@supabase/supabase-js@2.118.0';

const FUNCTION_NAME = 'expo-calendar-mcp';
const NOTE = 'Dates come from scraped sources. Check the official site before booking.';
const MAX_ROWS = 50;
const MAX_OVERLAPS = 100;

// SUPABASE_URL and SUPABASE_ANON_KEY are injected by the Edge Runtime.
// The anon key is public by design; RLS keeps it read-only.
const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
  auth: { persistSession: false, autoRefreshToken: false },
});

// ---------------------------------------------------------------------------
// Schemas
// ---------------------------------------------------------------------------
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'use YYYY-MM-DD');
const iso2 = z.string().regex(/^[A-Za-z]{2}$/, 'ISO 3166-1 alpha-2, e.g. SE').transform((s) => s.toUpperCase());
const dateStatus = z.enum(['confirmed', 'listing_only', 'tbc']);
const week = z.number().int().min(1).max(53);

const searchInput = z.strictObject({
  query: z.string().min(1).max(200).optional().describe('Fuzzy match on the show name'),
  countries: z.array(iso2).min(1).max(60).optional().describe('ISO2 country codes, e.g. ["SE","NO","DK","FI"]'),
  cities: z.array(z.string().min(1).max(100)).min(1).max(50).optional().describe('Exact city names (see list_facets), case-insensitive'),
  industries: z.array(z.string().min(1).max(100)).min(1).max(30).optional().describe('Exact industry values (see list_facets); matches any'),
  date_from: isoDate.optional().describe('Shows ending on or after this date'),
  date_to: isoDate.optional().describe('Shows starting on or before this date'),
  iso_year: z.number().int().min(2000).max(2100).optional().describe('ISO week-numbering year, used with week_from / week_to'),
  week_from: week.optional().describe('Start ISO week ≥ this'),
  week_to: week.optional().describe('Start ISO week ≤ this'),
  min_exhibitors: z.number().int().min(0).optional(),
  date_status: dateStatus.optional().describe('confirmed = organiser/venue site; listing_only = third-party listing'),
  limit: z.number().int().min(1).max(MAX_ROWS).default(25).describe(`Default 25, max ${MAX_ROWS}`),
  offset: z.number().int().min(0).max(10_000).default(0),
}).refine((v) => (v.week_from == null && v.week_to == null) || v.iso_year != null,
  { message: 'week_from / week_to need iso_year', path: ['iso_year'] });

const getShowInput = z.strictObject({
  id: z.uuid().optional(),
  series_key: z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/).max(200).optional(),
  edition_year: z.number().int().min(2000).max(2100).optional(),
}).refine((v) => v.id != null || (v.series_key != null && v.edition_year != null),
  { message: 'give id, or series_key + edition_year' });

const overlapsInput = z.strictObject({
  show_id: z.uuid().optional(),
  date_from: isoDate.optional(),
  date_to: isoDate.optional(),
  countries: z.array(iso2).min(1).max(60).optional(),
  industries: z.array(z.string().min(1).max(100)).min(1).max(30).optional(),
}).refine((v) => v.show_id != null || (v.date_from != null && v.date_to != null),
  { message: 'give show_id, or date_from + date_to' })
  .refine((v) => v.date_from == null || v.date_to == null || v.date_from <= v.date_to,
    { message: 'date_from must be on or before date_to' });

const sinceInput = z.strictObject({
  since: isoDate.describe('Return shows first seen after this date'),
  limit: z.number().int().min(1).max(MAX_ROWS).default(MAX_ROWS),
  offset: z.number().int().min(0).max(10_000).default(0),
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
const LIST_COLUMNS = 'id, name, series_key, edition_year, start_date, end_date, iso_week_start, iso_week_end, city, country_code, venue, industries, exhibitors_estimate, frequency, date_status, website, last_seen_at';
const FULL_COLUMNS = 'id, series_key, edition_year, name, start_date, end_date, iso_week_start, iso_week_end, iso_year, city, country_code, country_name, venue, industries, organiser, website, exhibitors_estimate, attendees_estimate, audience, frequency, date_status, sources, source_urls, notes, first_seen_at, last_seen_at';

class ToolError extends Error {}

function ok(payload: Record<string, unknown>) {
  return { content: [{ type: 'text' as const, text: JSON.stringify({ ...payload, note: NOTE }) }] };
}

function fail(message: string) {
  return { isError: true, content: [{ type: 'text' as const, text: JSON.stringify({ error: message, note: NOTE }) }] };
}

/** Validates with zod, runs the tool, logs name/duration/row count only. */
function tool<S extends z.ZodType>(name: string, schema: S, run: (args: z.output<S>) => Promise<{ payload: Record<string, unknown>; rows: number }>) {
  return async (raw: unknown) => {
    const t0 = performance.now();
    let rows = 0;
    try {
      const parsed = schema.safeParse(raw ?? {});
      if (!parsed.success) return fail(`invalid input: ${z.prettifyError(parsed.error)}`);
      const out = await run(parsed.data);
      rows = out.rows;
      return ok(out.payload);
    } catch (err) {
      // Don't echo database internals back to the caller.
      return fail(err instanceof ToolError ? err.message : 'query failed');
    } finally {
      console.log(JSON.stringify({ tool: name, ms: Math.round(performance.now() - t0), rows }));
    }
  };
}

function check<T>(res: { data: T; error: { message: string } | null }): T {
  if (res.error) throw new Error(res.error.message);
  return res.data;
}

function isoWeekKey(dateStr: string): string {
  const d = new Date(`${dateStr}T00:00:00Z`);
  const day = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - day);
  const year = d.getUTCFullYear();
  const week = Math.ceil(((d.getTime() - Date.UTC(year, 0, 1)) / 86_400_000 + 1) / 7);
  return `${year}-W${String(week).padStart(2, '0')}`;
}

// ---------------------------------------------------------------------------
// Server
// ---------------------------------------------------------------------------
function buildServer() {
  const server = new McpServer({ name: FUNCTION_NAME, version: '1.0.0' });
  const readOnly = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false };

  server.registerTool('search_shows', {
    title: 'Search trade shows',
    description:
      'Search the Expotential trade-show calendar (~8,000 shows, mostly 2026–2028, global with EMEA focus). ' +
      'All filters optional and combined with AND. Use list_facets first for exact country codes, cities and industries. ' +
      'Sorted by start_date ascending. Returns total and up to 50 rows.',
    inputSchema: searchInput,
    annotations: readOnly,
  }, tool('search_shows', searchInput, async (a) => {
    const res = check(await db.rpc('calendar_search_shows', {
      p_query: a.query ?? null, p_countries: a.countries ?? null, p_cities: a.cities ?? null,
      p_industries: a.industries ?? null, p_date_from: a.date_from ?? null, p_date_to: a.date_to ?? null,
      p_iso_year: a.iso_year ?? null, p_week_from: a.week_from ?? null, p_week_to: a.week_to ?? null,
      p_min_exhibitors: a.min_exhibitors ?? null, p_date_status: a.date_status ?? null,
      p_limit: a.limit, p_offset: a.offset,
    })) as { total: number; rows: unknown[] };
    return { payload: { total: res.total, limit: a.limit, offset: a.offset, rows: res.rows }, rows: res.rows.length };
  }));

  server.registerTool('get_show', {
    title: 'Get one show',
    description: 'Full details of one show edition by id, or by series_key + edition_year, plus the other editions of the same series (year and dates).',
    inputSchema: getShowInput,
    annotations: readOnly,
  }, tool('get_show', getShowInput, async (a) => {
    let q = db.from('calendar_shows').select(FULL_COLUMNS);
    q = a.id ? q.eq('id', a.id) : q.eq('series_key', a.series_key!).eq('edition_year', a.edition_year!);
    const show = check(await q.maybeSingle()) as Record<string, unknown> | null;
    if (!show) throw new ToolError('show not found');
    const others = check(await db.from('calendar_shows')
      .select('id, edition_year, start_date, end_date, date_status')
      .eq('series_key', show.series_key as string).neq('id', show.id as string)
      .order('edition_year').limit(MAX_ROWS)) as unknown[];
    return { payload: { show, other_editions: others }, rows: 1 + others.length };
  }));

  server.registerTool('find_overlaps', {
    title: 'Find overlapping shows',
    description:
      'Shows whose dates overlap a given show (show_id) or a date range (date_from + date_to), grouped by ISO week of their start date. ' +
      'For clash checks such as "what else runs the CPHI week". Optional country and industry filters. Max 100 rows.',
    inputSchema: overlapsInput,
    annotations: readOnly,
  }, tool('find_overlaps', overlapsInput, async (a) => {
    let from = a.date_from, to = a.date_to, reference: Record<string, unknown> | null = null;
    if (a.show_id) {
      reference = check(await db.from('calendar_shows').select('id, name, start_date, end_date, city, country_code')
        .eq('id', a.show_id).maybeSingle()) as Record<string, unknown> | null;
      if (!reference) throw new ToolError('show not found');
      if (!reference.start_date) throw new ToolError('that show has no dates yet');
      from = reference.start_date as string;
      to = (reference.end_date ?? reference.start_date) as string;
    }
    let q = db.from('calendar_shows').select(LIST_COLUMNS, { count: 'exact' })
      .lte('start_date', to!).gte('end_date', from!)
      .order('start_date').order('name').limit(MAX_OVERLAPS);
    if (a.show_id) q = q.neq('id', a.show_id);
    if (a.countries) q = q.in('country_code', a.countries);
    if (a.industries) q = q.overlaps('industries', a.industries);
    const { data, count, error } = await q;
    if (error) throw new Error(error.message);
    const rows = (data ?? []) as { start_date: string }[];
    const by_iso_week: Record<string, unknown[]> = {};
    for (const r of rows) (by_iso_week[isoWeekKey(r.start_date)] ??= []).push(r);
    return {
      payload: { reference, range: { from, to }, total: count ?? rows.length, returned: rows.length, by_iso_week },
      rows: rows.length,
    };
  }));

  server.registerTool('list_facets', {
    title: 'List filter values',
    description: 'Distinct countries (code + name), cities, industries, years and date_status values with counts, and the date range covered. Use these exact values as search filters.',
    inputSchema: z.strictObject({}),
    annotations: readOnly,
  }, tool('list_facets', z.strictObject({}), async () => {
    const facets = check(await db.rpc('calendar_facets')) as Record<string, unknown>;
    return { payload: facets, rows: 1 };
  }));

  server.registerTool('shows_added_since', {
    title: 'Shows added since a date',
    description: 'Shows first seen in the calendar after the given date — "what is new since the last scrape". Newest first, up to 50 per call.',
    inputSchema: sinceInput,
    annotations: readOnly,
  }, tool('shows_added_since', sinceInput, async (a) => {
    const { data, count, error } = await db.from('calendar_shows')
      .select(`${LIST_COLUMNS}, first_seen_at`, { count: 'exact' })
      .gt('first_seen_at', `${a.since}T23:59:59.999Z`)
      .order('first_seen_at', { ascending: false }).order('start_date')
      .range(a.offset, a.offset + a.limit - 1);
    if (error) throw new Error(error.message);
    return { payload: { since: a.since, total: count ?? 0, limit: a.limit, offset: a.offset, rows: data ?? [] }, rows: data?.length ?? 0 };
  }));

  return server;
}

// ---------------------------------------------------------------------------
// HTTP
// ---------------------------------------------------------------------------
const app = new Hono().basePath(`/${FUNCTION_NAME}`);

app.all('*', async (c) => {
  // Stateless: a fresh server + transport per request.
  const server = buildServer();
  const transport = new WebStandardStreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
  await server.connect(transport);
  return transport.handleRequest(c.req.raw);
});

Deno.serve(app.fetch);
