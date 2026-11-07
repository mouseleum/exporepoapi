export const NAME_CANDIDATES = [
  "company",
  "exhibitor",
  "exhibitorname",
  "name",
  "organisation",
  "organization",
  "firm",
];

export const COUNTRY_CANDIDATES = ["country", "nation", "land", "pays"];

export const HALL_CANDIDATES = [
  "hall",
  "booth",
  "stand",
  "pavilion",
  "location",
  "area",
];

const normalize = (s: string): string =>
  s.toLowerCase().replace(/[\s_-]/g, "");

export function guessCol(headers: string[], candidates: string[]): string {
  for (const c of candidates) {
    const cn = normalize(c);
    const match = headers.find((h) => normalize(h).includes(cn));
    if (match) return match;
  }
  return "";
}

export function guessAllColumns(headers: string[]): {
  name: string;
  country: string;
  hall: string;
} {
  return {
    name: guessCol(headers, NAME_CANDIDATES),
    country: guessCol(headers, COUNTRY_CANDIDATES),
    hall: guessCol(headers, HALL_CANDIDATES),
  };
}

// Library CSV import needs hall and booth as SEPARATE columns, because
// event_exhibitors stores them separately. HALL_CANDIDATES above deliberately
// lumps them together (the Ranker has one "Hall/Booth" concept), so it cannot
// be reused here — widening it would change Ranker column detection.
export const HALL_ONLY_CANDIDATES = ["hall", "pavilion"];
export const BOOTH_CANDIDATES = ["booth", "stand"];

export type ExhibitorColumns = {
  name: string;
  country: string;
  hall: string;
  booth: string;
};

export function guessExhibitorColumns(headers: string[]): ExhibitorColumns {
  const name = guessCol(headers, NAME_CANDIDATES);
  const country = guessCol(headers, COUNTRY_CANDIDATES);
  let hall = guessCol(headers, HALL_ONLY_CANDIDATES);
  const booth = guessCol(headers, BOOTH_CANDIDATES);
  // A single "Hall/Booth" or "Stand (Hall 3)" column matches both. Treat it as
  // the booth — in practice that column holds a stand number — rather than
  // writing the same string into both DB columns.
  if (hall && hall === booth) hall = "";
  return { name, country, hall, booth };
}
