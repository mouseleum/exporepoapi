-- 0011_exhibitor_lists_bucket.sql
-- Private Storage bucket for the CSV files exhibitor-browser-agent produces when
-- it runs as a cloud worker. The agent uploads to
--   exhibitor-lists/<event-slug>/<event-slug>-<date>.csv
-- and records `storage:exhibitor-lists/<path>` in extraction_jobs.output_path.
-- Expotential Calendar serves downloads through short-lived signed URLs from
-- /api/exhibitor-jobs?download=<showId>.
--
-- Private, no RLS policies: only the secret (service-role) key, used by the
-- agent and the calendar API, can read or write it.
--
-- Apply manually via Supabase SQL Editor.

insert into storage.buckets (id, name, public)
values ('exhibitor-lists', 'exhibitor-lists', false)
on conflict (id) do nothing;
