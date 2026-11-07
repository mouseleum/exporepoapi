// events.source is an adapter family key for scraped shows. A show whose list
// was imported from a CSV carries this sentinel instead.
//
// Two consequences worth knowing:
//   - refreshAllEvents skips any event whose source has no registered adapter
//     family, so CSV events are left alone by the weekly cron. Nothing to
//     special-case there.
//   - the admin table's per-event fetch actions have no adapter to call, so
//     they are disabled for these rows (re-import the CSV instead).
//
// Kept in its own module so client components can read it without pulling in
// the Supabase client that lib/library/import-csv.ts imports.
export const CSV_SOURCE = "csv";
