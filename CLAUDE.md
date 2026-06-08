# ExpoRanker / Exhibitor Intel

Extension of the existing **ExpoRanker** app (live at exporepoapi.vercel.app, repo: github.com/mouseleum/exporepoapi). The starting codebase is a single `index.html` plus a `/api/` directory of vanilla JS Vercel functions — a one-shot CSV scorer: upload exhibitor list → enrich → rank → display.

We are doing two things, in order:

1. **Migrate** the existing app to Next.js App Router + TypeScript strict (Phase 0). No new features. Behavior identical to today.
2. **Extend** with a persistent, DB-backed library mode alongside the CSV upload (Phase 1+). Scrape exhibitor lists from event platforms automatically, store them, score them on demand, and surface top targets across many shows.

**Both modes coexist.** The CSV upload flow stays as-is (it's the escape hatch for novel one-off shows). The new Library flow is additive.

## Build approach

Phased, additive, every phase ends in a working app and a commit:

0. **Migration to Next.js + TS** — port `index.html` and `/api/*.js` to Next.js App Router with TypeScript strict, Tailwind, Vitest, Zod. No behavior change. See `docs/migration-audit.md` for the spec. ✅ shipped
1. **DB foundation** — Supabase schema (`db/migrations/0001_companies.sql`, project ref `hihhgpzcklusonxnbfcn`), Apollo CSV bulk loader (`scripts/load-apollo.ts`). ✅ 9 986 rows loaded; loader is idempotent on `apollo_account_id`. Service-role key in `.env.local` only — Vercel env wiring deferred to Phase 4. `company-db-agent` stays parallel for lightweight country lookups.
2. **Refactor scorer to pure** — source-agnostic, used by both CSV and DB modes.
3. **First adapter** — generic HTML scraper for cyberseceurope.com (`lib/adapters/cyberseceurope.ts`); defines `Adapter` interface (`lib/adapters/types.ts`) for future platform-specific adapters. New tables `events` + `event_exhibitors` (`db/migrations/0002_events.sql`); loader `pnpm load:event <slug>`. ✅ 194 rows loaded for `cyberseceurope-2026`. Originally scoped as Swapcard in earlier plan; pivoted because the target show is a static HTML list. Swapcard adapter deferred to Phase 3.5 when a real Swapcard URL is in scope.
4. **Library UI** — new `/library` route reads from DB. ✅ pick an event, see Apollo-enriched preview, score with the same `runScoringPipeline` (`lib/scoring-pipeline.ts`) used by CSV mode; matched rows skip PDL via `prefilledEnriched`. Vercel env wiring (`SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`) still pending → out of Phase 4.
5. **Cron** — Vercel Cron schedules adapters weekly. ✅ code shipped: `app/api/cron/refresh/route.ts` calls `refreshAllEvents()` (`lib/library/refresh.ts`) which walks every row in `events`, looks up the matching adapter in `lib/adapters/registry.ts`, and re-runs `loadEventForAdapter()`. `vercel.json` schedules `/api/cron/refresh` for `0 6 * * 0` (Sunday 06:00 UTC). Local equivalent: `pnpm refresh`. Cron requires Vercel env wiring (`SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `CRON_SECRET`) — same prerequisite as Phase 4.
6. **More adapters** — generic DIMEDIS Vis platform adapter (`lib/adapters/dimedis.ts`) covering interpack, drupa, medica, glasstec, boot, and MapYourShow adapter (`lib/adapters/mapyourshow.ts`) covering Battery Show / NAB / IBC etc. Still pending: ExpoFP, Swapcard.
7. **Event Registry** — per-event adapter config moved into `events.adapter_config` JSONB; `events.source` is now an adapter family key, not a per-show identifier. Adapters became factories (`AdapterFactory`) keyed by family in `lib/adapters/registry.ts`; the five DIMEDIS wrapper files were deleted. New `/library/admin` page with CRUD + "Fetch now" lets new shows be added without code (`db/migrations/0003_admin_events.sql`, `lib/library/admin-queries.ts`, `app/library/admin/`). `events.romify_attending` (DB column kept under legacy name; UI calls it "My company") drives a default filter on `/library`; on `/compare` the filter was dropped — all events load and attended ones get a ★.
8. **Phase 2: contacts/people enrichment** — only after Phase 1 has been useful for one show cycle.
9. **HubSpot enrichment on /library/companies** — OAuth-installed integration that pulls HubSpot Companies + their associated Deals/Engagements/Owners, matches against `companies.website` by registrable domain, and writes per-company signals (met_by_me / met_by_team / in_pipeline + last engagement + latest open deal) to a new `company_hubspot_signals` table. UI adds a "Connected as <email> · Last synced … · [Sync now]" strip, three badges per row (💼 You / 👥 Team / 📈 Pipeline), and four filter chips. On-demand sync only (no cron). Files: `db/migrations/0009_hubspot_oauth_and_signals.sql`, `lib/hubspot/{auth,client,domain,sync}.ts`, `app/api/auth/hubspot/{connect,callback,disconnect}/route.ts`, `app/api/hubspot/{status,sync}/route.ts`. Env: `HUBSPOT_CLIENT_ID`, `HUBSPOT_CLIENT_SECRET`, optional `HUBSPOT_REDIRECT_URI`. ✅ shipped 2026-06-08 (apply the 0009 migration manually in Supabase before connecting).

Don't skip ahead. Phase 1 does not start until Phase 0 is merged and verified on production.

## External docs (Context7)

Before writing code that touches **Next.js**, the **Vercel AI SDK**, **Zod**, or **Vercel serverless APIs** (functions, `vercel.json`, runtime config, cron), consult Context7 first: `mcp__context7__resolve-library-id` then `mcp__context7__query-docs`. Don't rely on training-data recall for these — their APIs drift fast and the answer in your weights is likely stale.

## PDL enrichment

Parked behind `NEXT_PUBLIC_PDL_ENABLED` (default `false`) because the free-tier
key is permanently exhausted (`HTTP 402 "all matches used"`). With the flag off
the scoring pipeline skips `/api/enrich` and scores on Apollo-matched data +
name + country only. Re-enable: set the env var to `"true"` in `.env.local`
and the Vercel project env after topping up PDL. All PDL code (route,
`enrichCompanies`, schemas) is left in place.
