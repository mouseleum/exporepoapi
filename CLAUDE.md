# ExpoRanker / Exhibitor Intel

Extension of the existing **ExpoRanker** app (live at exporepoapi.vercel.app, repo: github.com/mouseleum/exporepoapi). The starting codebase is a single `index.html` plus a `/api/` directory of vanilla JS Vercel functions — a one-shot CSV scorer: upload exhibitor list → enrich → rank → display.

We are doing two things, in order:

1. **Migrate** the existing app to Next.js App Router + TypeScript strict (Phase 0). No new features. Behavior identical to today.
2. **Extend** with a persistent, DB-backed library mode alongside the CSV upload (Phase 1+). Import exhibitor lists, store them, score them on demand, and surface top targets across many shows.

**Both modes coexist.** The CSV upload flow stays as-is (it's the escape hatch for novel one-off shows). The new Library flow is additive.

## The acquisition boundary (read before adding a scraper)

**Getting exhibitor lists off trade fair websites does not happen in this repo.**
It is done by a Claude skill (`exhibitor-list-extraction`) plus a browser
bookmarklet that runs on the fair's own page and downloads a CSV.

- **Outside this repo:** finding, extracting and exporting exhibitor lists.
- **Inside this repo:** ingesting a list, resolving companies, scoring them,
  planning the floor route.

The interface between the two halves is a CSV file and nothing else. The reason
is that the halves change for unrelated reasons: acquisition breaks when a fair
changes its directory platform, scoring changes when targeting changes. While
they were coupled here, a fair redesigning its website could require a redeploy
of a scoring tool.

Phases 3, 5, 6 and 7 below built the in-repo half of that coupling — six site
adapters, a weekly refresh cron, a quick-extract pipeline. They were removed
once the boundary was drawn. Their entries are kept for the record, each marked
with what happened; `events.source` and `events.adapter_config` survive as
columns carrying historical values, and `extraction_jobs`,
`extraction_captures` and `event_exhibitor_people` are orphaned tables that
nothing writes any more.

## Build approach

Phased, additive, every phase ends in a working app and a commit:

0. **Migration to Next.js + TS** — port `index.html` and `/api/*.js` to Next.js App Router with TypeScript strict, Tailwind, Vitest, Zod. No behavior change. See `docs/migration-audit.md` for the spec. ✅ shipped
1. **DB foundation** — Supabase schema (`db/migrations/0001_companies.sql`, project ref `hihhgpzcklusonxnbfcn`), Apollo CSV bulk loader (`scripts/load-apollo.ts`). ✅ 9 986 rows loaded; loader is idempotent on `apollo_account_id`. Service-role key in `.env.local` only — Vercel env wiring deferred to Phase 4. `company-db-agent` stays parallel for lightweight country lookups.
2. **Refactor scorer to pure** — source-agnostic, used by both CSV and DB modes.
3. **First adapter** — ❌ **removed** (acquisition boundary). Was a generic HTML scraper for cyberseceurope.com plus the `Adapter` interface. The tables it introduced, `events` + `event_exhibitors` (`db/migrations/0002_events.sql`), are still the Library's core and are now filled by CSV import (`lib/library/import-csv.ts`). `pnpm load:event` is gone.
4. **Library UI** — new `/library` route reads from DB. ✅ pick an event, see Apollo-enriched preview, score with the same `runScoringPipeline` (`lib/scoring-pipeline.ts`) used by CSV mode; matched rows skip PDL via `prefilledEnriched`. Vercel env wiring (`SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`) still pending → out of Phase 4.
5. **Cron** — ❌ **removed** (acquisition boundary). Was a weekly Vercel Cron re-running every adapter. `vercel.json` now declares no crons, `pnpm refresh` is gone, and `CRON_SECRET` is no longer read. A list is refreshed by importing a newer CSV over the same slug.
6. **More adapters** — ❌ **removed** (acquisition boundary). Covered DIMEDIS (interpack, drupa, medica, glasstec, boot), MapYourShow, ExpoFP, Swapcard and solar-promotion. The platform knowledge now lives in the `exhibitor-list-extraction` skill instead.
7. **Event Registry** — ⚠️ **partly removed** (acquisition boundary). What survives: the `/library/admin` page (`db/migrations/0003_admin_events.sql`, `lib/library/admin-queries.ts`, `app/library/admin/`), now a CSV import plus an event table with rename / "My company" / delete; and `events.romify_attending` (DB column kept under its legacy name; the UI calls it "My company") driving a default filter on `/library`, with `/compare` loading all events and starring the attended ones. What went: the adapter-family registry, per-event `adapter_config` editing, "Fetch now", "Extract via Agent", and the `includePeople` / `includeCountry` flags, which only ever fed adapters. A show's `source` is now set by the importer (`"csv"`), not chosen.
8. **Phase 2: contacts/people enrichment** — on hold, and now needs a new source. The only implementation was Swapcard's `fetchPeople`, which went with the adapters, so `event_exhibitor_people` (`db/migrations/0004`, `0005`) keeps the rows it already has and gains no more. Whatever revives this has to bring people in across the CSV boundary, or from a source that is not a fair's website.
9. **HubSpot enrichment on /library/companies** — OAuth-installed integration that pulls HubSpot Companies + their associated Deals/Engagements/Owners, matches against `companies.website` by registrable domain, and writes per-company signals (met_by_me / met_by_team / in_pipeline + last engagement + latest open deal) to a new `company_hubspot_signals` table. UI adds a "Connected as <email> · Last synced … · [Sync now]" strip, three badges per row (💼 You / 👥 Team / 📈 Pipeline), and four filter chips. On-demand sync only (no cron). Files: `db/migrations/0009_hubspot_oauth_and_signals.sql`, `lib/hubspot/{auth,client,domain,sync}.ts`, `app/api/auth/hubspot/{connect,callback,disconnect}/route.ts`, `app/api/hubspot/{status,sync}/route.ts`. Env: `HUBSPOT_CLIENT_ID`, `HUBSPOT_CLIENT_SECRET`, optional `HUBSPOT_REDIRECT_URI`. ✅ shipped 2026-06-08 (apply the 0009 migration manually in Supabase before connecting).

Don't skip ahead. Phase 1 does not start until Phase 0 is merged and verified on production.

Phases 0-7 and 9 have all shipped (some since removed, as marked). New work
starts from the acquisition boundary above: if a task sounds like "fetch the
list from the fair's site", it belongs in the extraction skill, not here.

## External docs (Context7)

Before writing code that touches **Next.js**, the **Vercel AI SDK**, **Zod**, or **Vercel serverless APIs** (functions, `vercel.json`, runtime config, cron), consult Context7 first: `mcp__context7__resolve-library-id` then `mcp__context7__query-docs`. Don't rely on training-data recall for these — their APIs drift fast and the answer in your weights is likely stale.

## PDL enrichment

Parked behind `NEXT_PUBLIC_PDL_ENABLED` (default `false`) because the free-tier
key is permanently exhausted (`HTTP 402 "all matches used"`). With the flag off
the scoring pipeline skips `/api/enrich` and scores on Apollo-matched data +
name + country only. Re-enable: set the env var to `"true"` in `.env.local`
and the Vercel project env after topping up PDL. All PDL code (route,
`enrichCompanies`, schemas) is left in place.
