-- 0003_company_tags.sql
-- Customer/deal tagging keyed by name_normalized so tags survive
-- Apollo CSV reloads (companies table is rewritten by load-apollo).
-- Apply manually via Supabase SQL Editor.

create table company_tags (
  name_normalized text primary key,
  tag             text not null check (tag in ('customer', 'prospect', 'won', 'lost')),
  notes           text,
  updated_at      timestamptz not null default now()
);

create index company_tags_tag_idx on company_tags (tag);

alter table company_tags enable row level security;
