-- 0010_extraction_jobs_agent.sql
-- A second worker now reads extraction_jobs: exhibitor-browser-agent (Claude
-- Agent SDK + Playwright), fed by the "Exhibitors" button in Expotential
-- Calendar. It writes the exhibitor list to a CSV file on the machine it runs on.
--
-- `agent` says which worker owns a job, so the two never take each other's jobs:
--   'legacy'  → local-extract-agent (default, so existing rows and exporepoapi's
--               "Extract via Agent" button are unchanged)
--   'browser' → exhibitor-browser-agent
-- local-extract-agent must filter on agent = 'legacy' when claiming.
--
-- `output_path` is where the browser agent saved the CSV (absolute path on the
-- worker's machine), shown in the calendar once the job is done.
--
-- Apply manually via Supabase SQL Editor.

alter table extraction_jobs
  add column if not exists agent text not null default 'legacy'
    check (agent in ('legacy', 'browser'));

alter table extraction_jobs
  add column if not exists output_path text;

drop index if exists extraction_jobs_status_idx;
create index if not exists extraction_jobs_agent_status_idx
  on extraction_jobs (agent, status, created_at);
