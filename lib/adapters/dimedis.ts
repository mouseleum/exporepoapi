import { z } from "zod";
import type { Adapter, EventMeta, RawExhibitor } from "./types";

export const DimedisConfigSchema = z.object({
  domain: z.string().min(1),
  lang: z.string().min(1).optional(),
  minExhibitors: z.number().int().nonnegative().optional(),
});
export type DimedisConfig = z.infer<typeof DimedisConfigSchema>;

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

export function dimedisFactory(meta: EventMeta, config: unknown): Adapter {
  const parsed = DimedisConfigSchema.parse(config);
  const lang = parsed.lang ?? "en";
  const apiHost = `https://${parsed.domain}`;
  const apiBase = `${apiHost}/vis-api/vis/v1/${lang}`;
  const minExhibitors = parsed.minExhibitors ?? 50;

  const headers = {
    "X-Vis-Domain": parsed.domain,
    Accept: "application/json",
    "User-Agent": USER_AGENT,
  } as const;

  async function fetchJson<T>(url: string): Promise<T> {
    const res = await fetch(url, { headers });
    if (!res.ok) {
      throw new Error(`${meta.source} fetch ${url} failed: ${res.status}`);
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
        `${meta.source} fetch yielded ${out.length} exhibitors (expected >= ${minExhibitors}); API shape may have changed`,
      );
    }
    return out;
  }

  return { meta, fetch: fetchExhibitors };
}
