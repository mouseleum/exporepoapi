# Merging company-db-agent into exporepoapi

Folds the standalone `company-db-agent` (Vite SPA + GitHub-as-DB, ~3,686 records) into this app's Supabase `companies` table (~9,986 Apollo rows). After this work the standalone deploy is retired.

Phases are lettered (A–E) so they don't collide with the numbered Phase 0–8 plan in `CLAUDE.md`. Each phase is independently shippable and the standalone keeps working until Phase E.

## Why merge

- One Vercel app, one stack (Next.js/TS), one auth boundary, one env config.
- Drops GitHub-as-DB — it already bit us at the 1 MB Contents-API inline limit.
- Removes the cross-app sync surface we just built (`pushCompaniesToDb`).
- Standalone has no capability the Ranker doesn't, except a small set of curated data (see "What must survive").

## What must survive

Three things the standalone has that the Ranker doesn't model yet:

1. **`override` country picks.** Manual ISO codes the user typed in (couple dozen). Highest-confidence rows — never overwrite with anything else.
2. **`raw[]` aliases per record.** Different spellings of the same company collapsed under one normalized name. The Ranker currently does this only via `name_normalized` — aliases are the explicit record of which raw inputs collapsed.
3. **`confidence` ranking.** `override > pdl > wiki > suffix`. The sync logic uses this to decide when a new signal beats an existing one.

## Phases

### Phase A — Schema extension *(no behavior change)*

Migration `db/migrations/0006_companies_country_db.sql` adds to `companies`:

- `aliases text[] not null default '{}'`
- `country_confidence text` — `'override' | 'pdl' | 'wiki' | 'suffix'`, NULL = unset
- `country_sources text[] not null default '{}'`
- `country_updated_at timestamptz`

All nullable / defaulted, so existing code keeps working. **Acceptance:** migration applied in Supabase; columns visible; `pnpm typecheck && pnpm test` green.

### Phase B — One-time import from standalone

Script `scripts/import-company-db.ts` (`pnpm import:company-db`) — pulls every record from `company-db-agent.vercel.app/api/companies` and merges into `companies` keyed on `name_normalized`:

- **New row:** insert with `apollo_account_id = 'company-db:' + slug`, `source = 'company-db-agent'`, populate aliases/confidence/sources.
- **Existing row:** never overwrite country unless incoming `confidence === 'override'`. Always append to `aliases[]` and `country_sources[]` (deduped).
- **Dry-run mode** prints the merge plan (`--apply` to actually write).

**Acceptance:** dry-run output reviewed; apply run reports `+N inserted, ~M updated, =K unchanged`; spot-check 5 known override records — country preserved exactly.

### Phase C — Read-path cutover

Rewrite `lib/company-db.ts` `loadDB()` to query Supabase instead of the standalone:

```ts
supabase.from('companies').select('name_normalized, name, aliases, country').not('country', 'is', null)
```

Build the same `byRaw` + `byNormalized` maps from that result. Drop the `DB_URL` constant and the `fetch(...)` call.

Keep `pushCompaniesToDb` as a **no-op stub** that just logs — don't delete yet, so Phase D can be reverted independently. The fire-and-forget POST to the standalone stops.

**Acceptance:** run scoring on a real event, watch StatusBox say "DB filled N countries", confirm via Vercel runtime logs that no request to `company-db-agent.vercel.app` goes out. Existing test mock for `/api/companies` can be removed; mock for `/api/sync` stays (covers the stub).

### Phase D — Override UI

New route `/library/companies`:

- Server component that lists every row in `companies` (paginated, ~10k total).
- Search (name), filter (country, missing, confidence), inline 2-letter ISO override on click. Same shape as the standalone's table.
- Server actions: `listCompanies(opts)`, `overrideCompanyCountry(id, iso)` — the override action sets `country = iso`, `country_confidence = 'override'`, `country_updated_at = now()`, appends `'manual'` to `country_sources`.
- Add a nav link from `/library/admin` or wherever feels natural.

**Acceptance:** page loads, override flow works end-to-end, badge shows `manual` after save, country fills propagate to the next scoring run.

### Phase E — Retire the standalone

Cleanup, executed in one commit per item so each is revertable:

1. `lib/scoring-pipeline.ts`: remove the `pushCompaniesToDb` call + import.
2. `lib/company-db.ts`: remove the stub `pushCompaniesToDb` + its types.
3. `tests/lib-scoring-pipeline.test.ts`: drop the `/api/sync` mock branch.
4. `company-db-agent` repo: pin a README banner — "Superseded by exporepoapi `/library/companies`. The JSON in `data/companies.json` is retained as a one-time backup of the override picks." Don't delete the repo.
5. Vercel: either delete the `company-db-agent` project or set the domain to redirect to `https://exporepoapi.vercel.app/library/companies`.

**Acceptance:** `grep -r 'company-db-agent' lib app tests` returns nothing. `pnpm typecheck && pnpm test` green. Standalone URL either gone or redirecting.

## Order matters

- A → B → C → D → E. Skipping ahead breaks the standalone or strands data.
- A and B can ship as one commit if the import script is small.
- C is the riskiest commit because every Ranker run depends on the read path — verify on staging or via a manual scoring run before merging.
- Don't touch Phase E until at least one real scoring + one override edit have completed against the Supabase path.

## Non-goals

- Migrating company-db-agent's `/api/ingest` xlsx drag-drop — `/library/admin`'s adapter "Fetch now" already covers the same need via scraped sources. Manual xlsx upload is the escape hatch the CSV ranker already provides.
- Preserving GitHub commit history of the standalone's `data/companies.json`. The repo stays archived; that history is the audit trail.
- Backfilling `country_confidence` for the 9,986 Apollo rows — they keep NULL confidence. Only records touched by sync/override get a value.

## Rollback

Each phase is revertable in isolation:

- A: drop the columns (or just leave them — additive, no readers).
- B: `delete from companies where apollo_account_id like 'company-db:%' and source = 'company-db-agent'` — but you'd lose override picks that aliased into existing rows. Re-run the import to reconstruct.
- C: revert the `lib/company-db.ts` change; standalone is still serving.
- D: revert the route + actions; no data loss.
- E: revive the standalone Vercel project from the last deploy; restore the `pushCompaniesToDb` call.
