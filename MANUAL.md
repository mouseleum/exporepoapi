# ExpoRanker — Manual

A tool for picking the best companies to talk to at a trade show.

Live at **exporepoapi.vercel.app**. Four screens, accessed from the top nav.

---

## 1. Ranker (`/`)

One-shot scoring for a list you have on disk.

1. **Upload** a CSV, XLSX, or PDF exhibitor list (drag & drop or click).
2. **Map columns** — pick which column holds the company name, country, hall/booth.
3. **Country weights** — bump up the countries you care about (1–5).
4. **Target count** — how many top picks you want (default 50).
5. **Score with AI** — runs the pipeline:
   - Looks up each company in the Apollo deep store (employees, industry, revenue)
   - Falls back to PeopleDataLabs for the rest (parked — see `CLAUDE.md`)
   - Asks Claude to rank them given your country weights
   - Shows top-N in a sortable table; "Download CSV" exports the result.

### Save to Library
Below the action button, fill in **Event name / Year / Slug** and click **Save to Library**. This:
- Stores the list as a named event (`event_exhibitors`) so you can re-score it later without re-uploading,
- Seeds the global company deep store (`companies`) with any new names — so future events recognise them automatically.

The slug is the unique key. Re-saving with the same slug **adds to** the existing event; pick a new slug for a different show.

---

## 2. Library (`/library`)

Score events you've already saved.

- **Event picker** — dropdown of every saved event with exhibitor count and scrape date.
- **Preview** shows the first ~50 exhibitors, with Apollo enrichment columns filled in where matched.
- Same country weights + target count + **Score with AI** as Ranker. Apollo-matched rows skip the PDL call (already enriched); PDL itself is currently parked behind `NEXT_PUBLIC_PDL_ENABLED`.
- Search / filter to narrow the preview by name or country.

Source events also include any auto-scraped shows (cyberseceurope, interpack, drupa, medica, glasstec, boot via the DIMEDIS adapter). The weekly cron refreshes them on Sundays.

---

## 3. Compare (`/compare`)

Companies that appear at **two or more** saved events. Sorted by appearance count.

Useful for: "who shows up at every relevant trade show in our space?" — those are the prospects you want at the top of the list.

Each row shows: name, country, employees, industry, revenue, the events it appears at, and any tag.

---

## 4. Tags (`/library/tags`)

A flat tag layer on top of company names. Tag values: **customer / prospect / won / lost**.

- **Bulk import** — paste a list of company names (one per line or comma-separated), pick a tag, hit apply.
- Names are matched case-insensitively against the normalised name (`acme corp.` == `ACME CORP`).
- The **inventory** below shows every tagged company with its Apollo enrichment, sorted by most recent.

Tags appear on rows in Library and Compare so you know which ones you've already worked.

---

## Connect HubSpot (optional)

When you wire HubSpot to `/library/companies`, every company picks up three badges showing prior engagement:

- 💼 **You** — there's a HubSpot meeting / call / email / note on a contact at this company where you were the owner.
- 👥 **Team** — same, but the owner was a colleague (or unowned).
- 📈 **Pipeline** — at least one open deal is associated with the company. Hover for stage + amount.

One-time setup:

1. In **developers.hubspot.com → Apps → Create app**, add an OAuth redirect URL of `http://localhost:3000/api/auth/hubspot/callback` (and the Vercel equivalent if you're deploying). Request the read scopes the integration uses (companies, contacts, deals, owners, pipelines, emails).
2. Put the resulting **Client ID** + **Client Secret** into `.env.local` (or Vercel env) as `HUBSPOT_CLIENT_ID` / `HUBSPOT_CLIENT_SECRET`.
3. Apply migration `db/migrations/0009_hubspot_oauth_and_signals.sql` in the Supabase SQL Editor.
4. Open `/library/companies` → strip at the top says **HubSpot · Not connected**. Click **Connect** → HubSpot consent screen → redirected back.
5. Click **Sync now**. Sync iterates per matched company; full portals can take a minute. When it settles, the strip shows "Last synced just now" and matching rows light up with badges.

Filter chips for **Met by you / Met by team / In pipeline / No HubSpot** let you slice the Library by engagement state — useful for working an exhibitor list before a show. Clicking **Disconnect** clears the token; the signals stay visible until the next sync.

---

## Data model in one paragraph

`companies` is the global deep store (~10k Apollo rows + anything seeded from CSV uploads). `events` + `event_exhibitors` is the per-event lists, joined to `companies` by normalised name. `company_tags` is the tag layer. The Ranker also runs against this same data — Library is just the persistent counterpart to the CSV one-shot.

---

## When something goes wrong

- **"No valid company names found"** — check the column mapping; the name column is required.
- **PDF extraction misses companies** — the PDF parser is best-effort; export the list to CSV from source if you can.
- **Score errors with 529 / overload** — Anthropic API quota. Wait or top up credits.
- **Saved to wrong event slug** — there's no UI delete yet; ask Claude or run a one-off Supabase delete by slug.
