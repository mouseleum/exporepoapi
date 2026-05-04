import type { Adapter, EventMeta, RawExhibitor } from "./types";

export type DimedisConfig = {
  domain: string;
  source: string;
  slug: string;
  name: string;
  year: number | null;
  lang?: string;
  minExhibitors?: number;
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

const USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

export function createDimedisAdapter(config: DimedisConfig): Adapter {
  const lang = config.lang ?? "en";
  const apiHost = `https://${config.domain}`;
  const apiBase = `${apiHost}/vis-api/vis/v1/${lang}`;
  const sourceUrl = `${apiHost}/vis/v1/${lang}/directory/a`;
  const minExhibitors = config.minExhibitors ?? 50;

  const meta: EventMeta = {
    source: config.source,
    slug: config.slug,
    name: config.name,
    year: config.year,
    source_url: sourceUrl,
  };

  const headers = {
    "X-Vis-Domain": config.domain,
    Accept: "application/json",
    "User-Agent": USER_AGENT,
  } as const;

  async function fetchJson<T>(url: string): Promise<T> {
    const res = await fetch(url, { headers });
    if (!res.ok) {
      throw new Error(`${config.source} fetch ${url} failed: ${res.status}`);
    }
    return (await res.json()) as T;
  }

  async function fetchExhibitors(): Promise<RawExhibitor[]> {
    const dirMeta = await fetchJson<DirectoryMeta>(`${apiBase}/directory/meta`);
    const letters = dirMeta.links.filter((l) => l.isFilled).map((l) => l.link);
    const seen = new Set<string>();
    const out: RawExhibitor[] = [];
    for (const letter of letters) {
      const entries = await fetchJson<DirectoryEntry[]>(
        `${apiBase}/directory/${encodeURIComponent(letter)}`,
      );
      for (const r of parseLetter(entries)) {
        const key = r.raw_name.toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);
        out.push(r);
      }
    }
    if (out.length < minExhibitors) {
      throw new Error(
        `${config.source} fetch yielded ${out.length} exhibitors (expected >= ${minExhibitors}); API shape may have changed`,
      );
    }
    return out;
  }

  return { meta, fetch: fetchExhibitors };
}
