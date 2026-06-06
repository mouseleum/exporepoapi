-- 0008_extraction_captures_request_body_text.sql
-- Convert extraction_captures.request_body from jsonb to text.
--
-- The captured POST body is conceptually a string (whatever the SPA sent
-- as request payload — JSON, form-encoded, or anything else). Declaring
-- it jsonb caused two bugs:
--   1. Supabase JS deserializes jsonb → JS object on read, so the
--      `string | null` contract in the agent's StoredCapture type lied.
--      Replays of cached POST captures handed objects to fetch's body,
--      which coerces them to "[object Object]" — sending junk payloads.
--   2. Form-encoded or otherwise-non-JSON request bodies would have
--      failed the jsonb cast at INSERT time, blocking those captures
--      from being persisted at all.
--
-- Cast jsonb to text via ::text — PostgreSQL emits the JSON text form,
-- which round-trips correctly through Supabase JS now that the column
-- is text.
--
-- Apply manually via Supabase SQL Editor.

alter table extraction_captures
  alter column request_body type text
  using request_body::text;
