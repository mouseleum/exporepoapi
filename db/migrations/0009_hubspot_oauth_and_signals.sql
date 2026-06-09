-- 0009_hubspot_oauth_and_signals.sql
-- Phase 9 (HubSpot enrichment): per-company signals (met_by_me / met_by_team
-- / in_pipeline + last engagement + latest open deal) materialized into a
-- side table that /library/companies LEFT JOINs against.
--
-- Auth runs through a HubSpot Private App bearer token in env
-- (HUBSPOT_ACCESS_TOKEN), not OAuth — see lib/hubspot/auth.ts. There is no
-- token table in this schema; the token is configuration, not data.
--
-- Apply manually via Supabase SQL Editor.

create table if not exists company_hubspot_signals (
  company_id                 uuid primary key references companies(id) on delete cascade,
  hubspot_company_id         text         not null,
  matched_domain             text,
  met_by_me                  boolean      not null default false,
  met_by_team                boolean      not null default false,
  in_pipeline                boolean      not null default false,
  last_engagement_at         timestamptz,
  last_engagement_owner_name text,
  latest_open_deal_stage     text,
  latest_open_deal_amount    numeric,
  synced_at                  timestamptz  not null default now()
);

create index if not exists company_hubspot_signals_hubspot_company_id_idx
  on company_hubspot_signals (hubspot_company_id);

create index if not exists company_hubspot_signals_filters_idx
  on company_hubspot_signals (met_by_me, met_by_team, in_pipeline);
