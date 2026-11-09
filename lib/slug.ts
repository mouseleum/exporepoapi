// Event slug from a show name and year, shared by the two /library/admin paths
// that create events: the Add-event form and the CSV import. A slug is the
// unique key on events, so if those two spelled it differently, importing a
// list for a show that was added by hand would create a second event instead
// of filling the first.
//
// Moved here verbatim from components/library/EventAddForm.tsx — behaviour
// unchanged. NOTE: components/ranker/SaveToLibrary.tsx has its own copy that
// does NOT call .normalize("NFKD"), so it slugs "Müller GmbH" as "m-ller-gmbh"
// where this one gives "muller-gmbh". That divergence is left alone on
// purpose: reconciling it changes slugs for shows saved from the Ranker, which
// is a data question, not a refactor.
export function slugify(name: string, year: number | null): string {
  const base = name
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  if (!year) return base;
  return base.endsWith(`-${year}`) || base === String(year)
    ? base
    : `${base}-${year}`;
}
