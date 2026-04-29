-- 0001_companies.sql
-- Phase 1: deep store for Apollo-sourced exhibitor data.
-- Apply manually via Supabase SQL Editor.

create table companies (
  id              uuid primary key default gen_random_uuid(),
  apollo_account_id  text unique not null,
  source          text not null default 'apollo',

  name            text not null,
  name_normalized text not null,
  name_for_emails text,
  account_stage   text,
  lists           text,
  account_owner   text,

  industry        text,
  employees       integer,
  founded_year    integer,
  short_description text,

  website         text,
  linkedin_url    text,
  facebook_url    text,
  twitter_url     text,
  logo_url        text,
  phone           text,

  street          text,
  city            text,
  state           text,
  country         text,
  postal_code     text,
  address         text,

  keywords        text[],
  technologies    text[],
  sic_codes       text[],
  naics_codes     text[],

  total_funding         bigint,
  latest_funding        text,
  latest_funding_amount bigint,
  last_raised_at        date,
  annual_revenue        bigint,
  retail_locations      integer,

  subsidiary_of            text,
  subsidiary_of_org_id     text,

  primary_intent_topic    text,
  primary_intent_score    numeric,
  secondary_intent_topic  text,
  secondary_intent_score  numeric,

  apollo_custom   jsonb not null default '{}'::jsonb,

  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index companies_name_normalized_idx on companies (name_normalized);
create index companies_country_idx on companies (lower(country));
create index companies_industry_idx on companies (industry);

alter table companies enable row level security;
