-- 0012_calendar_shows.sql
-- Expotential Calendar (expotential-calendar.vercel.app) moves its show data
-- into this project so other tools — the expo-calendar-mcp Edge Function first —
-- can query it. One row per show edition (ISE 2027 and ISE 2028 are two rows).
--
-- Not to be confused with `events`, which is the Exhibitor Ranker's table of
-- shows that have an exhibitor list. calendar_shows.event_id links the two.
--
-- Writers: expotential-calendar/scripts/import-calendar-json.ts (service role).
-- Readers: anyone with the anon key (RLS select policy), read-only.
-- No existing table or policy is changed.

create extension if not exists pg_trgm with schema extensions;

-- ---------------------------------------------------------------------------
-- Scrape runs
-- ---------------------------------------------------------------------------
create table calendar_scrape_runs (
  id            uuid primary key default gen_random_uuid(),
  started_at    timestamptz not null default now(),
  finished_at   timestamptz,
  status        text not null default 'running'
                check (status in ('running', 'succeeded', 'failed')),
  rows_seen     integer,
  rows_inserted integer,
  rows_updated  integer,
  rows_missing  integer,   -- rows in calendar_shows not seen in this run
  notes         text
);

alter table calendar_scrape_runs enable row level security;
-- No policies: service role only.
revoke all on calendar_scrape_runs from anon, authenticated;

-- ---------------------------------------------------------------------------
-- Shows
-- ---------------------------------------------------------------------------
create table calendar_shows (
  id                  uuid primary key default gen_random_uuid(),
  series_key          text not null check (series_key ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  edition_year        integer not null,
  calendar_slug       text unique,   -- the site's own show id (shows.json `id`)
  name                text not null,
  name_normalized     text not null, -- same rule as exporepoapi lib/normalize.ts
  start_date          date,
  end_date            date,
  iso_week_start      integer generated always as (extract(isoweek from start_date)::integer) stored,
  iso_week_end        integer generated always as (extract(isoweek from end_date)::integer) stored,
  iso_year            integer generated always as (extract(isoyear from start_date)::integer) stored,
  city                text,
  country_code        char(2) check (country_code ~ '^[A-Z]{2}$'),
  country_name        text,
  venue               text,
  industries          text[] not null default '{}',
  organiser           text,
  website             text,
  exhibitors_estimate integer,
  attendees_estimate  integer,
  audience            text check (audience in ('b2b', 'b2c', 'mixed')),
  major_city          boolean,
  frequency           text not null default 'unknown'
                      check (frequency in ('annual', 'biennial', 'triennial', 'irregular', 'unknown')),
  date_status         text not null default 'listing_only'
                      check (date_status in ('confirmed', 'listing_only', 'tbc')),
  sources             text[] not null default '{}',
  source_urls         jsonb not null default '{}'::jsonb,
  event_id            uuid references events(id) on delete set null,
  first_seen_at       timestamptz not null default now(),
  last_seen_at        timestamptz,
  scrape_run_id       uuid references calendar_scrape_runs(id) on delete set null,
  notes               text,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  unique (series_key, edition_year),
  check (end_date is null or start_date is null or end_date >= start_date)
);

create index calendar_shows_start_date_idx   on calendar_shows (start_date);
create index calendar_shows_country_code_idx on calendar_shows (country_code);
create index calendar_shows_iso_week_idx     on calendar_shows (iso_year, iso_week_start);
create index calendar_shows_first_seen_idx   on calendar_shows (first_seen_at);
create index calendar_shows_event_id_idx     on calendar_shows (event_id);
create index calendar_shows_industries_idx   on calendar_shows using gin (industries);
create index calendar_shows_name_trgm_idx    on calendar_shows using gin (name_normalized extensions.gin_trgm_ops);

create function calendar_shows_set_updated_at() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger calendar_shows_updated_at
  before update on calendar_shows
  for each row execute function calendar_shows_set_updated_at();

alter table calendar_shows enable row level security;

create policy "calendar_shows readable by anyone"
  on calendar_shows for select
  to anon, authenticated
  using (true);
-- No insert/update/delete policies: only the service role writes.
revoke insert, update, delete, truncate on calendar_shows from anon, authenticated;

-- ---------------------------------------------------------------------------
-- Read helpers for expo-calendar-mcp (security invoker → RLS applies; they
-- read calendar_shows only).
-- ---------------------------------------------------------------------------

-- Fuzzy name search + filters, sorted by start_date (nulls last).
create function calendar_search_shows(
  p_query          text    default null,
  p_countries      text[]  default null,
  p_cities         text[]  default null,
  p_industries     text[]  default null,
  p_date_from      date    default null,
  p_date_to        date    default null,
  p_iso_year       integer default null,
  p_week_from      integer default null,
  p_week_to        integer default null,
  p_min_exhibitors integer default null,
  p_date_status    text    default null,
  p_limit          integer default 25,
  p_offset         integer default 0
) returns jsonb
language sql stable security invoker set search_path = public, extensions as $$
  with q as (
    select nullif(regexp_replace(lower(coalesce(p_query, '')), '[^a-z0-9]', '', 'g'), '') as norm
  ),
  matched as (
    select s.*
    from calendar_shows s, q
    where (q.norm is null
           or s.name_normalized like '%' || q.norm || '%'
           or word_similarity(q.norm, s.name_normalized) >= 0.5)
      and (p_countries  is null or s.country_code = any (p_countries))
      and (p_cities     is null or lower(s.city) = any (select lower(c) from unnest(p_cities) c))
      and (p_industries is null or s.industries && p_industries)
      and (p_date_from  is null or coalesce(s.end_date, s.start_date) >= p_date_from)
      and (p_date_to    is null or s.start_date <= p_date_to)
      and (p_iso_year   is null or s.iso_year = p_iso_year)
      and (p_week_from  is null or s.iso_week_start >= p_week_from)
      and (p_week_to    is null or s.iso_week_start <= p_week_to)
      and (p_min_exhibitors is null or s.exhibitors_estimate >= p_min_exhibitors)
      and (p_date_status is null or s.date_status = p_date_status)
  )
  select jsonb_build_object(
    'total', (select count(*) from matched),
    'rows', coalesce((
      select jsonb_agg(r order by r.start_date nulls last, r.name)
      from (
        select id, name, series_key, edition_year, start_date, end_date,
               iso_week_start, iso_week_end, city, country_code, venue, industries,
               exhibitors_estimate, frequency, date_status, website, last_seen_at
        from matched
        order by start_date nulls last, name
        limit least(greatest(coalesce(p_limit, 25), 1), 50)
        offset greatest(coalesce(p_offset, 0), 0)
      ) r
    ), '[]'::jsonb)
  );
$$;

-- Distinct filter values with counts, and the date range covered.
create function calendar_facets() returns jsonb
language sql stable security invoker set search_path = public as $$
  select jsonb_build_object(
    'total_shows', (select count(*) from calendar_shows),
    'date_range', (select jsonb_build_object('from', min(start_date), 'to', max(coalesce(end_date, start_date))) from calendar_shows),
    'countries', (select coalesce(jsonb_agg(jsonb_build_object('code', country_code, 'name', country_name, 'count', n) order by n desc), '[]')
                  from (select country_code, min(country_name) as country_name, count(*) as n
                        from calendar_shows where country_code is not null group by country_code) c),
    'cities', (select coalesce(jsonb_agg(jsonb_build_object('city', city, 'country_code', country_code, 'count', n) order by n desc), '[]')
               from (select city, country_code, count(*) as n
                     from calendar_shows where city is not null group by city, country_code) c),
    'industries', (select coalesce(jsonb_agg(jsonb_build_object('industry', industry, 'count', n) order by n desc), '[]')
                   from (select unnest(industries) as industry, count(*) as n
                         from calendar_shows group by 1) i),
    'date_status', (select coalesce(jsonb_object_agg(date_status, n), '{}')
                    from (select date_status, count(*) as n from calendar_shows group by 1) d),
    'years', (select coalesce(jsonb_object_agg(edition_year, n), '{}')
              from (select edition_year, count(*) as n from calendar_shows group by 1) y)
  );
$$;

grant execute on function calendar_search_shows(text, text[], text[], text[], date, date, integer, integer, integer, integer, text, integer, integer) to anon, authenticated;
grant execute on function calendar_facets() to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Linking calendar_shows → events (service role only; used by
-- expotential-calendar/scripts/link-events.ts). Names are compared with the
-- year stripped, because most calendar names carry no year ("ESTRO") while
-- exhibitor-list events usually do ("ESTRO 2026"); the year must still match.
-- ---------------------------------------------------------------------------
create function calendar_event_link_candidates(p_threshold real default 0.6)
returns table (
  show_id uuid, show_name text, show_year integer, show_start_date date,
  event_id uuid, event_name text, event_year integer,
  similarity real, exact boolean
)
language sql stable security invoker set search_path = public, extensions as $$
  with e as (
    select ev.id, ev.name,
           coalesce(ev.year, substring(ev.name from '(?:19|20)\d{2}')::integer) as yr,
           regexp_replace(regexp_replace(lower(ev.name), '[^a-z0-9]', '', 'g'), '(19|20)\d{2}', '', 'g') as norm
    from events ev
  ),
  s as (
    select cs.id, cs.name, cs.edition_year, cs.start_date,
           regexp_replace(cs.name_normalized, '(19|20)\d{2}', '', 'g') as norm
    from calendar_shows cs
  )
  select s.id, s.name, s.edition_year, s.start_date,
         e.id, e.name, e.yr,
         extensions.similarity(s.norm, e.norm), s.norm = e.norm
  from s join e on e.yr = s.edition_year
  where s.norm = e.norm or extensions.similarity(s.norm, e.norm) >= p_threshold;
$$;

revoke execute on function calendar_event_link_candidates(real) from public, anon, authenticated;
grant execute on function calendar_event_link_candidates(real) to service_role;
