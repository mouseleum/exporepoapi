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
3. **First adapter (Swapcard)** — port existing GraphQL pattern.
4. **Library UI** — new `/library` route reads from DB.
5. **Cron** — Vercel Cron schedules adapters weekly.
6. **More adapters** (MYS, ExpoFP).
7. **Phase 2: contacts/people enrichment** — only after Phase 1 has been useful for one show cycle.

Don't skip ahead. Phase 1 does not start until Phase 0 is merged and verified on production.
