import { isSolarPromotionHost } from "@/lib/adapters/solar-promotion";

export type InferredEvent = {
  family:
    | "dimedis"
    | "cyberseceurope"
    | "mapyourshow"
    | "expofp"
    | "swapcard"
    | "solar-promotion";
  adapter_config: Record<string, unknown>;
  source_url: string;
  suggestedName?: string;
  suggestedYear?: number;
  partial?: boolean;
  warning?: string;
};

const USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36";

function safeParseUrl(raw: string): URL | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  try {
    const u = new URL(trimmed);
    if (u.protocol !== "http:" && u.protocol !== "https:") return null;
    return u;
  } catch {
    return null;
  }
}

function yearFromPath(pathOrHost: string): number | undefined {
  const m = pathOrHost.match(/(?<!\d)((?:19|20)\d{2})(?!\d)/);
  if (!m || !m[1]) return undefined;
  const n = Number(m[1]);
  return Number.isInteger(n) ? n : undefined;
}

function inferYearFromUrl(url: URL): number | undefined {
  return (
    yearFromPath(decodeURIComponent(url.pathname)) ??
    yearFromPath(url.host) ??
    yearFromPath(url.search)
  );
}

function inferCyberseceurope(url: URL): InferredEvent | null {
  if (!/(^|\.)cyberseceurope\.com$/.test(url.host)) return null;
  return {
    family: "cyberseceurope",
    adapter_config: {},
    source_url: url.toString(),
    suggestedYear: inferYearFromUrl(url),
  };
}

function inferExpoFp(url: URL): InferredEvent | null {
  // Subdomain form: <key>.expofp.com  (path /data/data.js or anything else)
  // Hosted form:   app.expofp.com/home/<x>?expoKey=<key>
  let expoKey: string | null = null;
  if (/(^|\.)expofp\.com$/.test(url.host)) {
    const sub = url.host.replace(/\.expofp\.com$/, "");
    if (sub && sub !== "app" && sub !== "www") expoKey = sub;
  }
  const q = url.searchParams.get("expoKey");
  if (q) expoKey = q;
  if (!expoKey) return null;
  return {
    family: "expofp",
    adapter_config: { expoKey },
    source_url: url.toString(),
    suggestedYear: inferYearFromUrl(url),
  };
}

function inferMapYourShow(url: URL): InferredEvent | null {
  if (!/(^|\.)mapyourshow\.com$/.test(url.host)) return null;
  return {
    family: "mapyourshow",
    adapter_config: { domain: url.host },
    source_url: url.toString(),
    suggestedYear: inferYearFromUrl(url),
  };
}

function inferDimedis(url: URL): InferredEvent | null {
  // DIMEDIS Vis exposes /vis/v<n>/<lang>/directory/...
  const m = url.pathname.match(
    /^\/vis\/v\d+\/([a-z]{2})\/directory(?:\/|$)/i,
  );
  if (!m) return null;
  const lang = (m[1] ?? "").toLowerCase();
  return {
    family: "dimedis",
    adapter_config: { domain: url.host, ...(lang ? { lang } : {}) },
    source_url: url.toString(),
    suggestedYear: inferYearFromUrl(url),
  };
}

function inferSwapcardFromUrl(url: URL): { viewId: string } | null {
  // Swapcard white labels show up under many hostnames:
  //   visitor.<show>.com/event/<slug>/exhibitors/<viewId>
  //   attendees.<vendor>.com/widget/event/<slug>/exhibitors/<viewId>
  // The viewId base64 always decodes to "EventView_<n>" (RXZlbnRWaWV3Xz…).
  const m = url.pathname.match(
    /\/event\/[^/]+\/exhibitors\/([A-Za-z0-9_=\-+/]+)\/?$/,
  );
  if (!m || !m[1]) return null;
  const viewId = m[1];
  if (!viewId.startsWith("RXZlbnRWaWV3Xz")) return null;
  return { viewId };
}

type SwapcardEventNode = {
  id?: string;
  title?: string;
  beginsAt?: string;
  __typename?: string;
};

function deepFindEvent(node: unknown): SwapcardEventNode | null {
  if (!node || typeof node !== "object") return null;
  if (Array.isArray(node)) {
    for (const item of node) {
      const found = deepFindEvent(item);
      if (found) return found;
    }
    return null;
  }
  const obj = node as Record<string, unknown>;
  if (
    typeof obj.__typename === "string" &&
    obj.__typename === "Core_Event" &&
    typeof obj.id === "string"
  ) {
    return obj as SwapcardEventNode;
  }
  for (const v of Object.values(obj)) {
    const found = deepFindEvent(v);
    if (found) return found;
  }
  return null;
}

export function parseSwapcardNextData(html: string): SwapcardEventNode | null {
  const m = html.match(
    /<script id="__NEXT_DATA__" type="application\/json">([\s\S]+?)<\/script>/,
  );
  if (!m || !m[1]) return null;
  let data: unknown;
  try {
    data = JSON.parse(m[1]);
  } catch {
    return null;
  }
  // Fast path: pageProps.event
  const fast = (data as { props?: { pageProps?: { event?: unknown } } })?.props
    ?.pageProps?.event;
  if (fast) {
    const candidate = fast as SwapcardEventNode;
    if (candidate.id) return candidate;
  }
  return deepFindEvent(data);
}

async function inferSwapcard(url: URL): Promise<InferredEvent | null> {
  const fromUrl = inferSwapcardFromUrl(url);
  if (!fromUrl) return null;
  const partialResult = (warning: string): InferredEvent => ({
    family: "swapcard",
    adapter_config: { viewId: fromUrl.viewId },
    source_url: url.toString(),
    suggestedYear: inferYearFromUrl(url),
    partial: true,
    warning,
  });

  let html: string;
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10_000);
    const res = await fetch(url.toString(), {
      method: "GET",
      headers: {
        "user-agent": USER_AGENT,
        accept: "text/html,application/xhtml+xml",
      },
      signal: controller.signal,
    });
    clearTimeout(timeout);
    if (!res.ok) {
      return partialResult(
        `Couldn't fetch the page (${res.status}) — paste the eventId manually.`,
      );
    }
    html = await res.text();
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return partialResult(
      `Couldn't reach the page (${msg}) — paste the eventId manually.`,
    );
  }
  if (html.includes("Client Challenge")) {
    return partialResult(
      "Page returned a bot challenge — paste the eventId manually.",
    );
  }

  const event = parseSwapcardNextData(html);
  if (!event?.id) {
    return partialResult(
      "Page loaded but eventId not found in __NEXT_DATA__ — paste it manually.",
    );
  }
  const year =
    (event.beginsAt ? yearFromPath(event.beginsAt) : undefined) ??
    inferYearFromUrl(url);
  return {
    family: "swapcard",
    adapter_config: { viewId: fromUrl.viewId, eventId: event.id },
    source_url: url.toString(),
    suggestedName: event.title?.trim() || undefined,
    suggestedYear: year,
  };
}

function inferSolarPromotion(url: URL): InferredEvent | null {
  if (!isSolarPromotionHost(url.host)) return null;
  // /exhibitorlist is the canonical landing page across all five sister sites
  // (thesmartere.de, intersolar.de, ees-europe.com, powertodrive.de, em-power.eu).
  // Adapter re-fetches the page on every run to harvest fresh menuPageId /
  // menuPageTypes / csrfToken, so we don't need to capture them here.
  const path = url.pathname.toLowerCase();
  if (!/^\/(exhibitorlist|exhibitor-list|product-list)\/?$/.test(path)) {
    return null;
  }
  return {
    family: "solar-promotion",
    adapter_config: {},
    source_url: url.toString(),
    suggestedYear: inferYearFromUrl(url),
  };
}

function findKnownIframeUrl(html: string, base: URL): string | null {
  // Pull every iframe src and pick the first one that any of our detectors
  // already know how to handle. Keeps iframe-sniffing decoupled from the
  // per-platform detectors — they remain the source of truth.
  const re = /<iframe[^>]+src=(?:"([^"]+)"|'([^']+)')/gi;
  for (const m of html.matchAll(re)) {
    const raw = (m[1] ?? m[2] ?? "").trim();
    if (!raw) continue;
    let abs: URL;
    try {
      abs = new URL(raw, base);
    } catch {
      continue;
    }
    if (abs.protocol !== "http:" && abs.protocol !== "https:") continue;
    if (
      inferCyberseceurope(abs) ||
      inferExpoFp(abs) ||
      inferMapYourShow(abs) ||
      inferDimedis(abs) ||
      inferSolarPromotion(abs) ||
      inferSwapcardFromUrl(abs)
    ) {
      return abs.toString();
    }
  }
  return null;
}

async function inferFromIframe(url: URL): Promise<InferredEvent | null> {
  let html: string;
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10_000);
    const res = await fetch(url.toString(), {
      method: "GET",
      headers: {
        "user-agent": USER_AGENT,
        accept: "text/html,application/xhtml+xml",
      },
      signal: controller.signal,
    });
    clearTimeout(timeout);
    if (!res.ok) return null;
    html = await res.text();
  } catch {
    return null;
  }
  if (
    html.includes("Attention Required") ||
    html.includes("Just a moment") ||
    html.includes("cf-browser-verification")
  ) {
    return null;
  }
  const iframeUrl = findKnownIframeUrl(html, url);
  if (!iframeUrl) return null;
  return inferOnce(iframeUrl);
}

async function inferOnce(raw: string): Promise<InferredEvent | null> {
  const url = safeParseUrl(raw);
  if (!url) return null;
  const syncMatch =
    inferCyberseceurope(url) ??
    inferExpoFp(url) ??
    inferMapYourShow(url) ??
    inferDimedis(url) ??
    inferSolarPromotion(url);
  if (syncMatch) return syncMatch;
  if (inferSwapcardFromUrl(url)) return inferSwapcard(url);
  return null;
}

export async function inferEventFromUrl(
  raw: string,
): Promise<InferredEvent | null> {
  const direct = await inferOnce(raw);
  if (direct) return direct;
  const url = safeParseUrl(raw);
  if (!url) return null;
  return inferFromIframe(url);
}
