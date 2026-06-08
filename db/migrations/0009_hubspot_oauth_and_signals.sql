-- 0009_hubspot_oauth_and_signals.sql
-- Phase 9 (HubSpot enrichment): OAuth-installed integration that pulls
-- HubSpot Companies + their associated Deals/Engagements/Owners, matches
-- against companies.website by registrable domain, and writes per-company
-- signals (met_by_me / met_by_team / in_pipeline) to a side table.
--
-- Two tables:
--   1. hubspot_oauth_tokens — keyed by portal_id (HubSpot hub id). Single
--      row in practice today (one user); table is keyed by portal so
--      multi-portal expansion later is a non-breaking change.
--   2. company_hubspot_signals — one row per matched companies.id, holding
--      the booleans the Library UI renders as badges + filter chips, plus
--      a few diagnostic fields (matched_domain, last_engagement_at, latest
--      open deal stage/amount).
--
-- Apply manually via Supabase SQL Editor.

create table if not exists hubspot_oauth_tokens (
  portal_id              bigint primary key,
  access_token           text         not null,
  refresh_token          text         not null,
  expires_at             timestamptz  not null,
  scope                  text         not null,
  current_user_owner_id  text,
  current_user_email     text,
  created_at             timestamptz  not null default now(),
  updated_at             timestamptz  not null default now()
);

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
