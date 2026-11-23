# expo-calendar-mcp

Read-only MCP server over the Expotential trade-show calendar (`calendar_shows`,
about 8,000 show editions, filled weekly by expotential-calendar's refresh).

**URL:** `https://hihhgpzcklusonxnbfcn.supabase.co/functions/v1/expo-calendar-mcp`

Public and needs no sign-in. It uses the anon key and relies on RLS
(`calendar_shows` can only be selected), reads only `calendar_shows`, and never
touches CRM, people or token tables. Every result includes `date_status` and the
note *"Dates come from scraped sources. Check the official site before booking."*

## Tools

| tool | inputs | returns |
|---|---|---|
| `search_shows` | all optional: `query` (fuzzy name), `countries` (ISO2), `cities`, `industries`, `date_from`, `date_to`, `iso_year` + `week_from` + `week_to`, `min_exhibitors`, `date_status`, `limit` (default 25, max 50), `offset` | `total` + rows sorted by `start_date` |
| `get_show` | `id`, or `series_key` + `edition_year` | full row + the series' other editions |
| `find_overlaps` | `show_id`, or `date_from` + `date_to`; optional `countries`, `industries` | overlapping shows grouped by ISO week (max 100) |
| `list_facets` | none | countries, cities, industries, years, date_status with counts; date range |
| `shows_added_since` | `since` (date), `limit`, `offset` | shows first seen after that date |

Inputs are validated with zod. Unknown fields and a `limit` above 50 are rejected.

## Connect

- **claude.ai:** Settings → Connectors → Add custom connector → paste the URL above.
- **Claude Code:**
  ```bash
  claude mcp add --transport http expo-calendar https://hihhgpzcklusonxnbfcn.supabase.co/functions/v1/expo-calendar-mcp
  ```

## Develop and deploy

```bash
supabase functions serve --no-verify-jwt expo-calendar-mcp   # local (needs Docker + `supabase start`)
npx @modelcontextprotocol/inspector                          # then open the local or live URL
supabase functions deploy --no-verify-jwt expo-calendar-mcp  # JWT check off: public server
```

Without Docker, `deno run -A index.ts` with `SUPABASE_URL` and `SUPABASE_ANON_KEY`
set serves it on `http://localhost:8000/expo-calendar-mcp`. Check types with
`deno check index.ts`.

Smoke test:

```bash
curl -s https://hihhgpzcklusonxnbfcn.supabase.co/functions/v1/expo-calendar-mcp \
  -H 'Content-Type: application/json' -H 'Accept: application/json, text/event-stream' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"search_shows","arguments":{"countries":["SE","NO","DK","FI"],"iso_year":2027,"week_from":14,"week_to":22}}}'
```

The SQL behind it (`calendar_shows`, `calendar_search_shows`, `calendar_facets`)
is in `db/migrations/0012_calendar_shows.sql`.

## Keep-alive and plan

On the free plan the project pauses after a week without activity. The
expotential-calendar repo's `supabase-keep-alive.yml` Action calls `search_shows`
(limit 1) every Thursday. Move to Pro once the MCP and the Exhibitor Ranker are
in daily use; Pro projects don't pause.

If abuse ever shows up, add a shared-secret header check here and re-add the
connector with that header.
