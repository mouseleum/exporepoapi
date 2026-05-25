-- 0006_companies_country_db.sql
-- Phase A of the company-db-agent merge (docs/company-db-merge.md).
-- Adds the four columns the standalone tracks per record: raw-name aliases,
-- a confidence rank for the country resolution (override > pdl > wiki > suffix),
-- the list of event/source names that contributed to that country, and the
-- timestamp of the last country touch. All defaulted so existing code is
-- unaffected; readers/writers wire up in Phase B and beyond.
-- Apply manually via Supabase SQL Editor.

alter table companies
  add column if not exists aliases text[] not null default '{}';

alter table companies
  add column if not exists country_confidence text;

alter table companies
  add column if not exists country_sources text[] not null default '{}';

alter table companies
  add column if not exists country_updated_at timestamptz;
