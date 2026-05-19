import { z } from "zod";
import type { Adapter, EventMeta, RawExhibitor } from "./types";

// Solar Promotion / Messe München shared CMS — powers thesmartere.de,
// intersolar.de, ees-europe.com, powertodrive.de, em-power.eu. All five
// expose the same `/exhibitorlist` page backed by a `POST /search/execute`
// endpoint that returns HTML fragments.
//
// Bootstrap on every fetch: GET the source URL once to obtain the
// `tsefrontend` session cookie + the `menuPageId` / `menuPageTypes` IDs
// embedded in the page; GET `/wc/js/default.js` (with that cookie) to
// extract the matching `csrfToken`. Both are session-bound, so we can't
// cache them across runs.

export const SolarPromotionConfigSchema = z.object({
  menuPageId: z.string().min(1).optional(),
  menuPageTypes: z.array(z.string().min(1)).min(1).optional(),
  minExhibitors: z.number().int().nonnegative().optional(),
  pageSize: z.number().int().positive().optional(),
});
export type SolarPromotionConfig = z.infer<typeof SolarPromotionConfigSchema>;

const DEFAULT_MIN_EXHIBITORS = 50;
const MAX_PAGES = 200;
const USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36";

const SUPPORTED_HOSTS = [
  "thesmartere.de",
  "intersolar.de",
  "ees-europe.com",
  "powertodrive.de",
  "em-power.eu",
];

export function isSolarPromotionHost(host: string): boolean {
  const lower = host.toLowerCase();
  return SUPPORTED_HOSTS.some((h) => lower === h || lower.endsWith(`.${h}`));
}

type BootstrapState = {
  baseUrl: string;
  csrfToken: string;
  cookieHeader: string;
  menuPageId: string;
  menuPageTypes: string[];
};

function originOf(rawUrl: string): string {
  const u = new URL(rawUrl);
  return `${u.protocol}//${u.host}`;
}

function extractMenuPageId(html: string): string | null {
  const m = html.match(
    /id="menuPageId"[^>]*\bvalue="([0-9a-f]{16,40})"/i,
  );
  return m?.[1] ?? null;
}

function extractMenuPageTypes(html: string): string[] {
  const ids: string[] = [];
  const re =
    /<input[^>]*\bclass="[^"]*\bstatic-search-filters\b[^"]*"[^>]*\bdata-type="menuPageTypes"[^>]*\bdata-value="([^"]+)"/gi;
  for (const m of html.matchAll(re)) {
    const raw = m[1];
    if (!raw) continue;
    for (const id of raw.split(",")) {
      const trimmed = id.trim();
      if (trimmed) ids.push(trimmed);
    }
  }
  return ids;
}

function extractCsrfToken(js: string): string | null {
  const m = js.match(/var\s+csrfToken\s*=\s*"([0-9a-f-]{8,64})"/i);
  return m?.[1] ?? null;
}

function parseSetCookies(headerOrList: string | string[] | null): string {
  if (!headerOrList) return "";
  const list = Array.isArray(headerOrList) ? headerOrList : [headerOrList];
  const out: string[] = [];
  for (const raw of list) {
    // node fetch concatenates multiple Set-Cookie with ", " — split safely on
    // the boundary between cookie pairs (each pair ends before "; <attr>=" or
    // before another "name=value, name=value" pair). For our purposes the
    // CMS only sets `tsefrontend`, so a simple name=value extraction is enough.
    for (const piece of raw.split(/,(?=\s*[A-Za-z0-9_-]+=)/)) {
      const m = piece.trim().match(/^([A-Za-z0-9_-]+)=([^;]*)/);
      if (m && m[1] && m[2] !== undefined) out.push(`${m[1]}=${m[2]}`);
    }
  }
  return out.join("; ");
}

async function bootstrap(
  meta: EventMeta,
  config: SolarPromotionConfig,
): Promise<BootstrapState> {
  const baseUrl = originOf(meta.source_url);
  const pageRes = await fetch(meta.source_url, {
    method: "GET",
    headers: {
      "User-Agent": USER_AGENT,
      Accept: "text/html,application/xhtml+xml",
    },
  });
  if (!pageRes.ok) {
    throw new Error(
      `solar-promotion bootstrap GET ${meta.source_url} failed: ${pageRes.status}`,
    );
  }
  const html = await pageRes.text();
  const setCookieHeader =
    typeof pageRes.headers.getSetCookie === "function"
      ? pageRes.headers.getSetCookie()
      : pageRes.headers.get("set-cookie");
  const cookieHeader = parseSetCookies(setCookieHeader);
  if (!cookieHeader.includes("tsefrontend=")) {
    throw new Error(
      "solar-promotion bootstrap: tsefrontend session cookie not set",
    );
  }

  const menuPageId = config.menuPageId ?? extractMenuPageId(html);
  if (!menuPageId) {
    throw new Error(
      "solar-promotion bootstrap: could not find menuPageId on the page",
    );
  }
  const menuPageTypes =
    config.menuPageTypes && config.menuPageTypes.length > 0
      ? config.menuPageTypes
      : extractMenuPageTypes(html);
  if (menuPageTypes.length === 0) {
    throw new Error(
      "solar-promotion bootstrap: could not find menuPageTypes on the page",
    );
  }

  const jsRes = await fetch(`${baseUrl}/wc/js/default.js`, {
    method: "GET",
    headers: {
      "User-Agent": USER_AGENT,
      Accept: "application/javascript, text/javascript, */*",
      Cookie: cookieHeader,
      Referer: meta.source_url,
    },
  });
  if (!jsRes.ok) {
    throw new Error(
      `solar-promotion bootstrap GET /wc/js/default.js failed: ${jsRes.status}`,
    );
  }
  const csrfToken = extractCsrfToken(await jsRes.text());
  if (!csrfToken) {
    throw new Error(
      "solar-promotion bootstrap: csrfToken not found in /wc/js/default.js",
    );
  }

  return { baseUrl, csrfToken, cookieHeader, menuPageId, menuPageTypes };
}

export function parsePage(html: string): RawExhibitor[] {
  const out: RawExhibitor[] = [];
  // One teaser per <a class="teaser" ...> with a data-content-id. Splitting on
  // the opening tag is more forgiving than trying to balance the inner
  // <div>/<ul> nesting with a single regex.
  const teaserRe =
    /<a\b[^>]*\bclass="teaser"[^>]*\bdata-content-id="([0-9a-f]{8,40})"[^>]*>([\s\S]*?)<\/a>/gi;
  for (const m of html.matchAll(teaserRe)) {
    const sourceId = m[1] ?? "";
    const body = m[2] ?? "";

    const headingMatch = body.match(
      /<div\b[^>]*\bclass="list-item-heading"[^>]*>([\s\S]*?)<\/div>\s*<div\b[^>]*\bclass="list-item-image"/i,
    );
    const heading = headingMatch?.[1] ?? "";
    const boothMatch = heading.match(/<div\b[^>]*>([\s\S]*?)<\/div>/i);
    const nameMatch = heading.match(
      /<span\b[^>]*\bclass="h3"[^>]*>([\s\S]*?)<\/span>/i,
    );
    const rawName = decodeEntities(stripTags(nameMatch?.[1] ?? "")).trim();
    if (!rawName) continue;
    const booth = decodeEntities(stripTags(boothMatch?.[1] ?? "")).trim() || null;

    const metaMatch = body.match(
      /<div\b[^>]*\bclass="list-item-meta-teaser-container"[^>]*>([\s\S]*?)<\/div>\s*<\/div>/i,
    );
    let country: string | null = null;
    if (metaMatch?.[1]) {
      const countryMatch = metaMatch[1].match(
        /<span\b[^>]*\bclass="h2"[^>]*>([\s\S]*?)<\/span>/i,
      );
      country = decodeEntities(stripTags(countryMatch?.[1] ?? "")).trim() || null;
    }

    out.push({
      raw_name: rawName,
      country,
      hall: null,
      booth,
      source_id: sourceId || null,
    });
  }
  return out;
}

const NAMED_ENTITIES: Record<string, string> = {
  amp: "&",
  nbsp: " ",
  quot: '"',
  apos: "'",
  lt: "<",
  gt: ">",
  ndash: "–",
  mdash: "—",
};

function decodeEntities(s: string): string {
  return s.replace(/&(#x[0-9a-fA-F]+|#\d+|[a-zA-Z]+);/g, (full, body: string) => {
    if (body.startsWith("#x") || body.startsWith("#X")) {
      const code = parseInt(body.slice(2), 16);
      return Number.isFinite(code) ? String.fromCodePoint(code) : full;
    }
    if (body.startsWith("#")) {
      const code = parseInt(body.slice(1), 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : full;
    }
    return NAMED_ENTITIES[body] ?? full;
  });
}

function stripTags(s: string): string {
  return s.replace(/<[^>]+>/g, "");
}

export function solarPromotionFactory(
  meta: EventMeta,
  config: unknown,
): Adapter {
  const parsed = SolarPromotionConfigSchema.parse(config ?? {});
  const minExhibitors = parsed.minExhibitors ?? DEFAULT_MIN_EXHIBITORS;

  async function fetchExhibitors(): Promise<RawExhibitor[]> {
    const state = await bootstrap(meta, parsed);
    const url = `${state.baseUrl}/search/execute`;

    const merged = new Map<string, RawExhibitor>();
    let lastPageSize = -1;
    for (let page = 1; page <= MAX_PAGES; page++) {
      const body = JSON.stringify({
        page,
        menuPageId: state.menuPageId,
        menuPageTypes: state.menuPageTypes,
        term: "",
        sortBy: "ALPHA",
        sortDirection: "ASC",
        displayType: "list",
        ...(parsed.pageSize ? { size: parsed.pageSize } : {}),
      });
      const res = await fetch(url, {
        method: "POST",
        headers: {
          "User-Agent": USER_AGENT,
          Accept: "text/html, */*; q=0.01",
          "Content-Type": "application/json",
          "X-CSRF-TOKEN": state.csrfToken,
          "X-Requested-With": "XMLHttpRequest",
          Cookie: state.cookieHeader,
          Referer: meta.source_url,
        },
        body,
      });
      if (!res.ok) {
        throw new Error(
          `solar-promotion search/execute page ${page} failed: ${res.status}`,
        );
      }
      const html = await res.text();
      const rows = parsePage(html);
      if (rows.length === 0) break;

      let added = 0;
      for (const r of rows) {
        const key = (r.source_id ?? r.raw_name).toLowerCase();
        if (merged.has(key)) continue;
        merged.set(key, r);
        added++;
      }
      // Server returns a fixed page size; when a page yields nothing new the
      // pagination has cycled past the last real page.
      if (added === 0) break;
      // If a page comes back smaller than the previous one *and* it's also
      // smaller than 10 rows, treat it as the final page. Avoids one extra
      // 200 OK that returns the same overflow slice.
      if (lastPageSize > 0 && rows.length < lastPageSize && rows.length < 10) {
        break;
      }
      lastPageSize = rows.length;
    }

    const out = Array.from(merged.values());
    if (out.length < minExhibitors) {
      throw new Error(
        `solar-promotion returned only ${out.length} exhibitors (min=${minExhibitors}); page layout may have changed`,
      );
    }
    return out;
  }

  return { meta, fetch: fetchExhibitors };
}
