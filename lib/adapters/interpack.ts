import type { Adapter, EventMeta, RawExhibitor } from "./types";

const API_HOST = "https://www.interpack.com";
const API_BASE = `${API_HOST}/vis-api/vis/v1/en`;
const VIS_DOMAIN = "www.interpack.com";
const SOURCE_URL = `${API_HOST}/vis/v1/en/directory/a`;
const MIN_EXHIBITORS = 1000;

const meta: EventMeta = {
  source: "interpack",
  slug: "interpack-2026",
  name: "interpack 2026",
  year: 2026,
  source_url: SOURCE_URL,
};

export type DirectoryMeta = {
  links: Array<{ link: string; label: string; isFilled: boolean }>;
};

export type DirectoryEntry = {
  id: string;
  type: string;
  exh?: string;
  name: string;
  country?: string;
  city?: string;
  location?: string;
};

const LOCATION_RE = /^Hall\s+(\S+)\s*\/\s*(.+)$/;

export function parseLocation(
  loc: string | undefined | null,
): { hall: string | null; booth: string | null } {
  const s = (loc ?? "").trim();
  if (!s) return { hall: null, booth: null };
  const m = s.match(LOCATION_RE);
  if (m) return { hall: m[1] ?? null, booth: (m[2] ?? "").trim() || null };
  return { hall: s, booth: null };
}

export function parseLetter(entries: DirectoryEntry[]): RawExhibitor[] {
  const out: RawExhibitor[] = [];
  for (const e of entries) {
    if (e.type !== "profile") continue;
    const name = (e.name ?? "").trim();
    if (!name) continue;
    const { hall, booth } = parseLocation(e.location);
    out.push({
      raw_name: name,
      country: (e.country ?? "").trim() || null,
      hall,
      booth,
    });
  }
  return out;
}

const FETCH_HEADERS = {
  "X-Vis-Domain": VIS_DOMAIN,
  Accept: "application/json",
  "User-Agent":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
} as const;

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { headers: FETCH_HEADERS });
  if (!res.ok) throw new Error(`interpack fetch ${url} failed: ${res.status}`);
  return (await res.json()) as T;
}

export async function fetchExhibitors(): Promise<RawExhibitor[]> {
  const meta = await fetchJson<DirectoryMeta>(`${API_BASE}/directory/meta`);
  const letters = meta.links.filter((l) => l.isFilled).map((l) => l.link);
  const seen = new Set<string>();
  const out: RawExhibitor[] = [];
  for (const letter of letters) {
    const entries = await fetchJson<DirectoryEntry[]>(
      `${API_BASE}/directory/${encodeURIComponent(letter)}`,
    );
    for (const r of parseLetter(entries)) {
      const key = r.raw_name.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(r);
    }
  }
  if (out.length < MIN_EXHIBITORS) {
    throw new Error(
      `interpack fetch yielded ${out.length} exhibitors (expected >= ${MIN_EXHIBITORS}); API shape may have changed`,
    );
  }
  return out;
}

export const interpackAdapter: Adapter = {
  meta,
  fetch: fetchExhibitors,
};
