-- 0004_event_exhibitor_people.sql
-- Phase 8: per-exhibitor people on platforms that expose them (Swapcard so far).
-- Apply manually via Supabase SQL Editor.

-- Existing event_exhibitors gets a source_id so platform-specific people queries
-- (which key by the platform's exhibitor id, e.g. Swapcard's base64) can FK back.
-- Nullable: pre-Phase-8 rows + adapters without source ids leave it null.
alter table event_exhibitors
  add column if not exists source_id text;

create index if not exists event_exhibitors_source_id_idx
  on event_exhibitors (source_id);

create table if not exists event_exhibitor_people (
  id                 uuid primary key default gen_random_uuid(),
  event_exhibitor_id uuid not null references event_exhibitors(id) on delete cascade,
  source_person_id   text,
  raw_name           text not null,
  first_name         text,
  last_name          text,
  job_title          text,
  organization       text,
  photo_url          text,
  raw_data           jsonb,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  unique (event_exhibitor_id, source_person_id)
);

create index if not exists event_exhibitor_people_exhibitor_idx
  on event_exhibitor_people (event_exhibitor_id);

alter table event_exhibitor_people enable row level security;
