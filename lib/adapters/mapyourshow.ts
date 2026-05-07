import { z } from "zod";
import type { Adapter, EventMeta, RawExhibitor } from "./types";

export const MapYourShowConfigSchema = z.object({
  domain: z.string().min(1),
  minExhibitors: z.number().int().nonnegative().optional(),
});
export type MapYourShowConfig = z.infer<typeof MapYourShowConfigSchema>;

type MysExhibitorFields = {
  exhname_t?: string;
  boothsdisplay_la?: string[];
  hallid_la?: string[];
};

type MysSearchResponse = {
  SUCCESS: boolean;
  DATA?: {
    totalhits?: number;
    results?: {
      exhibitor?: {
        found?: number;
        hit?: Array<{ fields: MysExhibitorFields }>;
      };
    };
  };
};

const USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

function stripBoothNoise(s: string): string {
  return s.replace(/randomstring/g, "").trim();
}

export function parseMysHit(hit: { fields: MysExhibitorFields }): RawExhibitor | null {
  const name = (hit.fields.exhname_t ?? "").trim();
  if (!name) return null;
  const rawBooth = hit.fields.boothsdisplay_la?.[0] ?? "";
  const booth = stripBoothNoise(rawBooth) || null;
  const hall = hit.fields.hallid_la?.[0]?.trim() || null;
  return { raw_name: name, country: null, hall, booth };
}

export function mapyourshowFactory(meta: EventMeta, config: unknown): Adapter {
  const parsed = MapYourShowConfigSchema.parse(config);
  const minExhibitors = parsed.minExhibitors ?? 50;
  const apiBase = `https://${parsed.domain}/8_0/ajax/remote-proxy.cfm`;
  const galleryUrl =
    meta.source_url ||
    `https://${parsed.domain}/8_0/explore/exhibitor-gallery.cfm?featured=false`;

  const fetchExhibitors = async (): Promise<RawExhibitor[]> => {
    // Step 1: bootstrap CFID/CFTOKEN cookies from the gallery page.
    const bootstrap = await fetch(galleryUrl, {
      headers: { "User-Agent": USER_AGENT },
    });
    if (!bootstrap.ok) {
      throw new Error(
        `${meta.source} bootstrap failed: ${bootstrap.status} ${galleryUrl}`,
      );
    }
    const setCookies =
      // Node fetch exposes set-cookie via .getSetCookie() in 18+; fallback to combined header.
      (typeof (bootstrap.headers as unknown as { getSetCookie?: () => string[] })
        .getSetCookie === "function"
        ? (bootstrap.headers as unknown as { getSetCookie: () => string[] })
            .getSetCookie()
        : [bootstrap.headers.get("set-cookie") ?? ""]
      ).filter(Boolean);
    const cookieHeader = setCookies
      .map((c) => c.split(";")[0])
      .filter((c) => c && c.includes("="))
      .join("; ");
    if (!cookieHeader) {
      throw new Error(`${meta.source} bootstrap returned no cookies`);
    }

    // Step 2: one big search call. The server silently returns 0 results when
    // searchsize is too large (~>10000), so cap below that.
    const SEARCH_SIZE = 10000;
    const url = `${apiBase}?action=search&searchtype=exhibitorgallery&searchsize=${SEARCH_SIZE}&start=0`;
    const res = await fetch(url, {
      headers: {
        "User-Agent": USER_AGENT,
        Accept: "application/json, text/plain, */*",
        "X-Requested-With": "XMLHttpRequest",
        Referer: galleryUrl,
        Cookie: cookieHeader,
      },
    });
    if (!res.ok) {
      throw new Error(`${meta.source} fetch failed: ${res.status}`);
    }
    const body = (await res.json()) as MysSearchResponse;
    if (!body.SUCCESS) {
      throw new Error(`${meta.source} API returned SUCCESS=false`);
    }
    const hits = body.DATA?.results?.exhibitor?.hit ?? [];
    const seen = new Set<string>();
    const out: RawExhibitor[] = [];
    for (const h of hits) {
      const row = parseMysHit(h);
      if (!row) continue;
      const key = row.raw_name.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(row);
    }
    if (out.length < minExhibitors) {
      throw new Error(
        `${meta.source} returned only ${out.length} exhibitors (min=${minExhibitors}); API shape may have changed`,
      );
    }
    return out;
  };

  return { meta, fetch: fetchExhibitors };
}
