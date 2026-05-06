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
   - Falls back to PeopleDataLabs for the rest
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
- Same country weights + target count + **Score with AI** as Ranker. Apollo-matched rows skip the PDL call (already enriched).
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

## Data model in one paragraph

`companies` is the global deep store (~10k Apollo rows + anything seeded from CSV uploads). `events` + `event_exhibitors` is the per-event lists, joined to `companies` by normalised name. `company_tags` is the tag layer. The Ranker also runs against this same data — Library is just the persistent counterpart to the CSV one-shot.

---

## When something goes wrong

- **"No valid company names found"** — check the column mapping; the name column is required.
- **PDF extraction misses companies** — the PDF parser is best-effort; export the list to CSV from source if you can.
- **Score errors with 529 / overload** — Anthropic API quota. Wait or top up credits.
- **Saved to wrong event slug** — there's no UI delete yet; ask Claude or run a one-off Supabase delete by slug.
