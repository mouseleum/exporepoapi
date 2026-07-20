// Client-side search over the /library/companies list.
//
// Matching is diacritic-insensitive ("muller" finds "Müller") and covers
// name, aliases, source/event names, and country (ISO code or English
// display name, so "germany" finds DE rows). Results are ordered by match
// quality: exact name/alias, then prefix, then substring, then metadata
// (event/country) hits. Within a rank the input order is preserved, so the
// alphabetical order from the DB survives.

export type SearchableCompany = {
  name: string;
  name_normalized: string;
  aliases: string[];
  source: string;
  country: string | null;
  country_sources: string[];
};

export type CompanySearchEntry<T extends SearchableCompany> = {
  row: T;
  name: string;
  norm: string;
  aliases: string[];
  meta: string[];
};

/** Lowercase and strip diacritics for accent-insensitive comparison. */
export function fold(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

// Intl.DisplayNames throws on malformed codes; some rows carry free-text
// countries ("Germany") rather than ISO, so those fall through to fold(country).
const regionNames =
  typeof Intl !== "undefined" && "DisplayNames" in Intl
    ? new Intl.DisplayNames(["en"], { type: "region" })
    : null;

// What people actually type vs. what CLDR calls the country (TR is "Türkiye"
// in current CLDR, GB is "United Kingdom", etc.). Folded at index time.
const COUNTRY_ALIASES: Record<string, string[]> = {
  TR: ["turkey"],
  GB: ["uk", "britain", "great britain", "england"],
  US: ["usa", "america", "united states of america"],
  NL: ["holland", "the netherlands"],
  CZ: ["czech republic"],
  AE: ["uae"],
  KR: ["korea"],
};

function countryDisplayName(cc: string): string {
  if (!/^[A-Z]{2}$/.test(cc)) return "";
  try {
    return regionNames?.of(cc) ?? "";
  } catch {
    return "";
  }
}

export function buildCompanySearchIndex<T extends SearchableCompany>(
  rows: T[],
): Array<CompanySearchEntry<T>> {
  return rows.map((row) => ({
    row,
    name: fold(row.name),
    norm: fold(row.name_normalized),
    aliases: row.aliases.map(fold),
    meta: [
      fold(row.source),
      ...row.country_sources.map(fold),
      ...(row.country
        ? [
            fold(row.country),
            fold(countryDisplayName(row.country)),
            ...(COUNTRY_ALIASES[row.country] ?? []),
          ]
        : []),
    ].filter(Boolean),
  }));
}

/** Match rank for a folded query; -1 means no match. Lower is better. */
export function rankMatch(
  entry: CompanySearchEntry<SearchableCompany>,
  q: string,
): number {
  if (entry.name === q || entry.aliases.some((a) => a === q)) return 0;
  if (entry.name.startsWith(q) || entry.aliases.some((a) => a.startsWith(q)))
    return 1;
  if (
    entry.name.includes(q) ||
    entry.norm.includes(q) ||
    entry.aliases.some((a) => a.includes(q))
  )
    return 2;
  // Metadata: exact hit always counts (country codes like "de"); substring
  // only from 3 chars so short queries don't drag in half the table via
  // event-name fragments.
  if (
    entry.meta.some((m) => m === q || (q.length >= 3 && m.includes(q)))
  )
    return 3;
  return -1;
}

/**
 * Filter + order `entries` for `query`. Entries must already be reduced to
 * the rows passing any non-text filters. Empty/whitespace query returns the
 * input order unchanged.
 */
export function searchCompanies<T extends SearchableCompany>(
  entries: Array<CompanySearchEntry<T>>,
  query: string,
): T[] {
  const q = fold(query.trim());
  if (!q) return entries.map((e) => e.row);
  const ranked: Array<{ rank: number; row: T }> = [];
  for (const e of entries) {
    const rank = rankMatch(e, q);
    if (rank >= 0) ranked.push({ rank, row: e.row });
  }
  ranked.sort((a, b) => a.rank - b.rank); // stable: input order kept per rank
  return ranked.map((r) => r.row);
}
