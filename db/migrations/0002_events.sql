-- 0002_events.sql
-- Phase 3: scraped exhibitor lists per event.
-- Apply manually via Supabase SQL Editor.

create table events (
  id          uuid primary key default gen_random_uuid(),
  source      text not null,
  slug        text not null unique,
  name        text not null,
  year        integer,
  source_url  text,
  scraped_at  timestamptz,
  created_at  timestamptz not null default now()
);

create table event_exhibitors (
  id              uuid primary key default gen_random_uuid(),
  event_id        uuid not null references events(id) on delete cascade,
  raw_name        text not null,
  name_normalized text not null,
  country         text,
  hall            text,
  booth           text,
  created_at      timestamptz not null default now(),
  unique (event_id, name_normalized)
);

create index event_exhibitors_event_idx on event_exhibitors (event_id);
create index event_exhibitors_name_norm_idx on event_exhibitors (name_normalized);

alter table events enable row level security;
alter table event_exhibitors enable row level security;
