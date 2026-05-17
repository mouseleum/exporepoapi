-- 0005_people_dedup_fix.sql
-- Fixes the unique constraint on event_exhibitor_people. The 0004 constraint
-- was `unique (event_exhibitor_id, source_person_id)`, but Postgres treats
-- NULL values as distinct in unique constraints — so any person Swapcard
-- returns without a source_person_id created a fresh duplicate row on every
-- refresh. Switch to a generated dedup key that falls back to raw_name when
-- the source id is missing.
-- Apply manually via Supabase SQL Editor.

alter table event_exhibitor_people
  drop constraint if exists event_exhibitor_people_event_exhibitor_id_source_person_id_key;

alter table event_exhibitor_people
  add column if not exists person_dedup_key text
    generated always as (coalesce(source_person_id, raw_name)) stored;

create unique index if not exists event_exhibitor_people_dedup_key_unique
  on event_exhibitor_people (event_exhibitor_id, person_dedup_key);
