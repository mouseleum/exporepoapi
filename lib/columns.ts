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
