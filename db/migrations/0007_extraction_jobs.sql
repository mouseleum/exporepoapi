-- 0007_extraction_jobs.sql
-- Tables backing the local-extract-agent workflow (separate repo:
-- ~/local-extract-agent). The agent runs on a home PC (or this Mac for dev),
-- polls extraction_jobs for pending work, drives Playwright + Haiku discovery
-- + local Qwen extraction, and writes results back into event_exhibitors[_people]
-- as well as a capture artifact into extraction_captures.
--
-- extraction_jobs is the work queue. exporepoapi inserts rows from the admin UI
-- ("Extract via Agent" button); the agent claims pending rows using
--   select ... for update skip locked
-- so multiple workers (Mac dev + PC prod) don't race.
--
-- extraction_captures is the long-lived record of what the agent discovered for
-- an event: the underlying XHR, how to replay it, and how to map response fields
-- to RawExhibitor columns. Subsequent refreshes hit the cache and skip the
-- Haiku discovery step. When the same request_url host shows up across several
-- captures, the pattern is hand-promoted to a coded adapter in lib/adapters/
-- and the source capture's promoted_at is set.
--
-- Apply manually via Supabase SQL Editor.

create table if not exists extraction_jobs (
  id            uuid primary key default gen_random_uuid(),
  event_id      uuid not null references events(id) on delete cascade,
  status        text not null default 'pending'
                  check (status in ('pending','claimed','done','failed','needs_review','rejected')),
  worker_id     text,
  claimed_at    timestamptz,
  completed_at  timestamptz,
  retry_count   integer not null default 0,
  error         text,
  summary       jsonb,
  created_at    timestamptz not null default now()
);

create index if not exists extraction_jobs_status_idx
  on extraction_jobs (status, created_at);

create index if not exists extraction_jobs_event_idx
  on extraction_jobs (event_id);

alter table extraction_jobs enable row level security;

create table if not exists extraction_captures (
  id              uuid primary key default gen_random_uuid(),
  event_id        uuid not null references events(id) on delete cascade,
  source_url      text not null,
  request_url     text not null,
  request_method  text not null,
  request_headers jsonb not null,
  request_body    jsonb,
  response_path   text not null,
  field_map       jsonb not null,
  pagination      jsonb,
  discovered_by   text not null,
  confidence      numeric,
  promoted_at     timestamptz,
  notes           text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index if not exists extraction_captures_event_idx
  on extraction_captures (event_id);

create index if not exists extraction_captures_request_host_idx
  on extraction_captures ((substring(request_url from '://([^/]+)')));

alter table extraction_captures enable row level security;
