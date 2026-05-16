import { z } from "zod";
import type { Adapter, EventMeta, RawExhibitor } from "./types";

export const ExpoFpConfigSchema = z.object({
  expoKey: z.string().min(1),
  minExhibitors: z.number().int().nonnegative().optional(),
});
export type ExpoFpConfig = z.infer<typeof ExpoFpConfigSchema>;

type ExpoFpExhibitor = {
  id?: number;
  name?: string;
  country?: string | null;
};

type ExpoFpBooth = {
  name?: string;
  exhibitors?: number[];
};

type ExpoFpData = {
  exhibitors?: ExpoFpExhibitor[];
  booths?: ExpoFpBooth[];
};

const USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

export function parse(scriptText: string): RawExhibitor[] {
  const stripped = scriptText
    .replace(/^\uFEFF/, "")
    .replace(/^\s*var\s+__data\s*=\s*/, "")
    .replace(/;\s*$/, "")
    .trim();
  const data = JSON.parse(stripped) as ExpoFpData;

  const boothByExhibitor = new Map<number, string>();
  for (const b of data.booths ?? []) {
    const name = (b.name ?? "").trim();
    if (!name) continue;
    for (const exId of b.exhibitors ?? []) {
      if (!boothByExhibitor.has(exId)) boothByExhibitor.set(exId, name);
    }
  }

  const out: RawExhibitor[] = [];
  const seen = new Set<string>();
  for (const e of data.exhibitors ?? []) {
    const name = (e.name ?? "").trim();
    if (!name) continue;
    const key = name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    const booth =
      typeof e.id === "number" ? boothByExhibitor.get(e.id) ?? null : null;
    out.push({
      raw_name: name,
      country: (e.country ?? null) || null,
      hall: null,
      booth,
    });
  }
  return out;
}

export function expofpFactory(meta: EventMeta, config: unknown): Adapter {
  const parsed = ExpoFpConfigSchema.parse(config);
  const minExhibitors = parsed.minExhibitors ?? 50;
  const url = `https://${parsed.expoKey}.expofp.com/data/data.js`;

  async function fetchExhibitors(): Promise<RawExhibitor[]> {
    const res = await fetch(url, {
      headers: {
        "User-Agent": USER_AGENT,
        Accept: "application/javascript, text/javascript, */*",
      },
    });
    if (!res.ok) {
      throw new Error(`expofp fetch failed: ${res.status} ${url}`);
    }
    const text = await res.text();
    const exhibitors = parse(text);
    if (exhibitors.length < minExhibitors) {
      throw new Error(
        `expofp returned only ${exhibitors.length} exhibitors (min=${minExhibitors}); data.js shape may have changed`,
      );
    }
    return exhibitors;
  }

  return { meta, fetch: fetchExhibitors };
}
