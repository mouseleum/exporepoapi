import type { Adapter, EventMeta, RawExhibitor } from "./types";

const MIN_EXHIBITORS = 50;

const NAMED_ENTITIES: Record<string, string> = {
  amp: "&",
  nbsp: "\u00a0",
  quot: '"',
  apos: "'",
  lt: "<",
  gt: ">",
  ndash: "\u2013",
  mdash: "\u2014",
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

export function parse(html: string): RawExhibitor[] {
  const blockRe = /<p\b[^>]*>\s*<strong\b[^>]*>([A-Z])<\/strong>([\s\S]*?)<\/p>/g;
  const out: RawExhibitor[] = [];
  for (const m of html.matchAll(blockRe)) {
    const inner = m[2] ?? "";
    const names = inner
      .split(/<br\b[^>]*\/?>/i)
      .map((s) => stripTags(s))
      .map(decodeEntities)
      .map((s) => s.trim())
      .filter((s) => s.length > 0 && s.length < 200);
    for (const n of names) out.push({ raw_name: n });
  }
  return out;
}

export function cyberseceuropeFactory(meta: EventMeta, _config: unknown): Adapter {
  async function fetchExhibitors(): Promise<RawExhibitor[]> {
    const res = await fetch(meta.source_url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
        Accept: "text/html,application/xhtml+xml",
      },
    });
    if (!res.ok) {
      throw new Error(`cyberseceurope fetch failed: ${res.status}`);
    }
    const html = await res.text();
    const exhibitors = parse(html);
    if (exhibitors.length < MIN_EXHIBITORS) {
      throw new Error(
        `cyberseceurope parse yielded ${exhibitors.length} exhibitors (expected >= ${MIN_EXHIBITORS}); page layout may have changed`,
      );
    }
    return exhibitors;
  }
  return { meta, fetch: fetchExhibitors };
}
