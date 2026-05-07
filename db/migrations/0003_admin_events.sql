-- 0003_admin_events.sql
-- Romify Event Registry: per-event adapter config in JSONB + curation flag.
-- Apply manually via Supabase SQL Editor.

alter table events add column adapter_config   jsonb   not null default '{}'::jsonb;
alter table events add column romify_attending boolean not null default false;

-- The DIMEDIS family is now keyed in code by `source = 'dimedis'`; per-show
-- parameters move into `adapter_config`. Currently only interpack-2026 has rows
-- in the live DB; drupa/medica/glasstec/boot were registered in code but never
-- loaded, so no migration row needed for them.
update events
  set source = 'dimedis',
      adapter_config = jsonb_build_object(
        'domain', 'www.interpack.com',
        'minExhibitors', 1000
      )
  where slug = 'interpack-2026';

-- Existing rows are by definition curated. Mark them so the upcoming Library
-- "Romify only" filter doesn't suddenly hide everything.
update events set romify_attending = true;
