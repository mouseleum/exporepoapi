# ExpoRanker / Exhibitor Intel

Next.js app at exporepoapi.vercel.app. See `CLAUDE.md` for the build history and
`MANUAL.md` for usage. Database migrations are in `db/migrations/`
(Supabase project `hihhgpzcklusonxnbfcn`).

## Expo Calendar MCP server

A read-only MCP server over the trade-show calendar (`calendar_shows`, migration
`0012`), deployed as a Supabase Edge Function:

`https://hihhgpzcklusonxnbfcn.supabase.co/functions/v1/expo-calendar-mcp`

Tools: `search_shows`, `get_show`, `find_overlaps`, `list_facets`, `shows_added_since`.

Connect it:
- **claude.ai:** Settings → Connectors → Add custom connector → paste the URL.
- **Claude Code:** `claude mcp add --transport http expo-calendar <URL>`

Details, tests and deploy steps: [`supabase/functions/expo-calendar-mcp/README.md`](supabase/functions/expo-calendar-mcp/README.md).
A weekly keep-alive (expotential-calendar `.github/workflows/supabase-keep-alive.yml`)
stops the free-plan project from pausing.
