# Migration audit — Phase 0

Faithful inventory of the existing app. The Phase 0 port to Next.js App Router + TypeScript strict must reproduce every behavior listed here. **No new features. No model upgrades. No refactors beyond what TS strict forces.** Anything labeled *risk* or *defer* is a Phase 0+ concern, not a Phase 0 task.

## Current shape

```
/
├── index.html        1224 lines — single page, two tabs (Ranker, Guide)
├── api/
│   ├── score.js      44 lines — proxies Anthropic Messages API
│   └── enrich.js     71 lines — proxies PeopleDataLabs company enrich
└── package.json      { "private": true }    # no deps; pure Vercel runtime
```

Deployed at `exporepoapi.vercel.app`. Vercel auto-detects `index.html` as static and `api/*.js` as Node serverless functions (CommonJS, `module.exports`).

External services:
- **Anthropic API** — `ANTHROPIC_API_KEY` env var, used by `/api/score`.
- **PeopleDataLabs (PDL)** — `PDL_API_KEY` env var, used by `/api/enrich`.
- **company-db-agent** — separate Vercel app at `https://company-db-agent.vercel.app`. Browser hits `/api/companies` (GET) and `/api/sync` (POST) directly; not proxied through this app.

Browser CDN deps (no bundler today):
- `xlsx.full.min.js` (SheetJS) — eager `<script>` tag.
- `pdf.js` 3.11.174 — lazy-injected on first PDF upload.
- Google Fonts: Syne, DM Mono, Chakra Petch.

## API routes — preserve exactly

### POST /api/score → `index.html` only caller

Request body: `{ prompt: string, max_tokens?: number, model?: string, tools?: array }`.

Behavior:
- 405 unless POST. OPTIONS returns 200 (CORS preflight).
- Sets `Access-Control-Allow-Origin: *`, `Allow-Methods: POST, OPTIONS`, `Allow-Headers: Content-Type`.
- 400 if `prompt` missing. 500 if `ANTHROPIC_API_KEY` missing.
- Defaults: `model = 'claude-sonnet-4-20250514'`, `max_tokens = 2000`.
- Forwards to `https://api.anthropic.com/v1/messages` with header `anthropic-version: 2023-06-01`.
- Returns Anthropic response verbatim on success. On non-2xx, returns `{ error: errText.slice(0,300) }` with the upstream status.

### POST /api/enrich

Request body: `{ companies: Array<{ name: string, country?: string }> }`.

Behavior:
- Same CORS / method handling as `/api/score`.
- 400 if `companies` empty/missing. 500 if `PDL_API_KEY` missing.
- Iterates in batches of 5, with a 200 ms `setTimeout` between batches (PDL rate limiting).
- Per company: GET `https://api.peopledatalabs.com/v5/company/enrich?name=…&api_key=…&location=…` (location only when `country` present).
- Maps PDL response to `{ name, matched: true, employee_count, employee_range (from PDL `size`), industry, revenue_range (from PDL `inferred_revenue`), founded, linkedin_url, tags }`.
- On non-200 or fetch error: `{ name, matched: false }`.
- Response: `{ results: [...] }`.

Note: only `name`, `matched`, `employee_count`, `industry` are read by the current frontend. Other fields are dead but should still ship in Phase 0 (preserve contract verbatim).

## Frontend — preserve exactly

Single `index.html`, dark-purple/lime theme, two tabs swapped via `switchTab()` (no router).

### Tab 1 — Exhibitor Ranker

**Inputs:** drag/drop or file picker accepting `.csv .xlsx .xls .pdf`.

**File parsing branches by extension:**
- `.csv` — custom parser, auto-detects `,` vs `;` delimiter, handles quoted fields with `""` escape.
- `.xlsx / .xls` — SheetJS `XLSX.read(buf, { type:'array', raw:false })`, first sheet, `sheet_to_json({ defval:'', raw:false })`.
- `.pdf` — pdf.js extracts all page text; chunked at 12000 chars with 500-char overlap; each chunk sent to `/api/score` with `model: 'claude-haiku-4-5-20251001'`, `max_tokens: 4000`, asking for `{companies:[{name,country,booth}]}`. Results deduped by `name.toLowerCase().trim()` (drops names <2 chars).

**Column picker:** auto-guesses Company Name / Country / Hall+Booth from header names (`guessCol` matches case-insensitively, ignoring spaces/dashes/underscores; candidate lists in `buildColumnPicker`).

**Country weighting:** when a country column is selected, top 10 countries by row count get sliders (0–100, default 50). Slider value translates to natural-language directives appended to the scoring prompt:
- `<20` → "STRONGLY deprioritize"
- `<40` → "Deprioritize"
- `>60` → "Prioritize"
- `>80` → "STRONGLY prioritize"
- `40–60` → no directive

**Top targets selector:** range 10–100, step 5, default 50.

**Score with AI flow** (`runScoring`):
1. Build `rows` from selected columns; drop names ≤1 char.
2. **DB pre-fill:** GET `${DB_URL}/api/companies`, build `{byRaw, byNormalized}` Maps, fill in `country` for rows where it's blank but DB has a hit. (Saves PDL credits.)
3. **PDL enrich:** chunks of 20, sequential, status updates per chunk. Match on `name.toLowerCase().trim()`.
4. **Claude rank:** prompt template (see source lines 994–1007) sent with `model: 'claude-sonnet-4-20250514'`, `max_tokens = min(4000, 800 + topN*30)`. Parses first `[...]` JSON array from response.
5. **Render** results table (rank, name, country, hall, employees, industry, score with colored bar). Score color: ≥80 green, ≥60 amber, else gray.
6. **Sync to DB** in background: POST `${DB_URL}/api/sync` with `{companies, source}` where `source` = filename without extension. Status message reports `added / updated / total`.

**Save to DB only** button: skips scoring, just POSTs name+country to `/api/sync`.

**Download CSV** button: `expotential_top${N}_targets.csv` with header `Rank,Company,Country,Hall/Booth,Employees,Industry,Score`. (Naive CSV — values wrapped in quotes but no escape for embedded `"`.)

### Tab 2 — List Guide

URL input → `/api/score` with `claude-sonnet-4-20250514`, `max_tokens: 1500`, and `tools: [{ type: 'web_search_20250305', name: 'web_search' }]`. Asks for JSON `{site_name, platform, difficulty, steps[{title,description}], tip}`. Renders styled card with platform/difficulty badges, numbered steps, optional tip box. Inline backticks in `description` get rewrapped as `<code>`.

## Phase 0 target

**Stack:**
- Next.js (App Router) + TypeScript strict.
- Tailwind for styling — port the existing color tokens (`--bg`, `--accent`, etc.) into `tailwind.config` theme; don't refactor the visual design.
- Zod schemas for both API request bodies. Reject invalid input with 400 + a structured error.
- Vitest + `@testing-library/react`. Smoke tests minimum: API handlers (mocked fetch), CSV parser, country-weight directive mapping, PDF chunker.
- ESLint + Prettier defaults; `tsc --noEmit` clean in CI.

**Structure:**
```
/
├── app/
│   ├── layout.tsx
│   ├── page.tsx            # Ranker tab UI (default)
│   ├── guide/page.tsx      # Or keep as in-page tab — match current UX
│   └── api/
│       ├── score/route.ts
│       └── enrich/route.ts
├── lib/
│   ├── csv.ts              # parser ported from index.html
│   ├── columns.ts          # guessCol + candidate lists
│   ├── country-weights.ts  # slider → prompt directive mapping
│   ├── pdf.ts              # pdf.js chunking (client-side dynamic import)
│   ├── prompts.ts          # ranker prompt + guide prompt templates
│   └── company-db.ts       # external DB client (loadDB, lookupInDB, syncToDB)
├── components/
│   ├── UploadZone.tsx
│   ├── ColumnPicker.tsx
│   ├── CountryWeights.tsx
│   ├── ResultsTable.tsx
│   └── GuideCard.tsx
├── docs/migration-audit.md (this file)
├── tests/
└── tailwind.config.ts
```

**API route notes:**
- Use Next.js route handlers (`export async function POST(req: Request)`).
- Preserve CORS headers verbatim — `*` origin, POST/OPTIONS, Content-Type. Even though same-origin works without them, removing them could break any external caller we don't know about.
- Keep model defaults and `anthropic-version: 2023-06-01` literal. **Do not** upgrade to a newer Sonnet/Haiku in Phase 0.
- PDL response field rename (`size → employee_range`, `inferred_revenue → revenue_range`) stays.

**Frontend notes:**
- SheetJS: install as npm dep (`xlsx`), import normally — no CDN script tag.
- pdf.js: install `pdfjs-dist`, dynamic-import the worker on first PDF upload (must be `'use client'`).
- Tab switching: pick one — either keep client-side tab state (closer to current behavior, fewer route changes) or split into `/` and `/guide`. **Recommendation: keep as in-page tabs** to make Phase 0 a true behavior-preserving port.
- Fonts: keep the Google Fonts links (or use `next/font/google`). Either is fine; `next/font` is more idiomatic.

**Out of scope for Phase 0 (defer):**
- Sonnet/Haiku model version updates.
- Replacing the naive CSV download with proper escaping.
- Any DB schema work (Supabase) — that's Phase 1.
- Pure scorer extraction — that's Phase 2.
- Removing the dead PDL fields (`employee_range`, `revenue_range`, `founded`, `linkedin_url`, `tags`).

## Verification checklist

Phase 0 is done when, on production:
- [ ] CSV upload → score → CSV download yields the same top-N companies with the same scores (±small variance from non-determinism) for a fixed input.
- [ ] XLSX upload works.
- [ ] PDF upload extracts company list (chunked) and proceeds to scoring.
- [ ] Country weight sliders alter rankings as before.
- [ ] DB pre-fill skips PDL for known companies (verify via PDL usage dashboard or logs).
- [ ] DB post-sync runs after scoring; status message shows added/updated counts.
- [ ] "Save to DB only" path works.
- [ ] List Guide tab: URL → renders step card with web-search-grounded content.
- [ ] `tsc --noEmit` and `vitest run` are clean. Vercel preview deploy is green.

## Risks / open questions

1. **`/api/score` is unauthenticated.** Anyone with the URL can bill the Anthropic key. Phase 0 should not change this (no behavior change), but flag for Phase 1+ — at minimum a referer or origin allowlist, ideally a session token.
2. **`/api/enrich` same problem.** PDL credits are finite; protect before any growth.
3. **CORS `*`** — confirm no third-party caller depends on this. If not, tighten in Phase 1.
4. **Web search tool name `web_search_20250305`** is a dated tool ID. Phase 0 keeps it; verify it still works on the current Anthropic API before cutover.
5. **company-db-agent** is a separate repo. Phase 1 needs to decide whether to fold it into this app or keep it standalone.
