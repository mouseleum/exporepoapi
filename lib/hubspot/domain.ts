// Phase 9 (HubSpot): website → domain extraction used as the join key against
// HubSpot Companies. HubSpot stores `domain` as a bare hostname (no scheme, no
// path, no www), so we normalize the same way here.
//
// We deliberately do NOT strip subdomains: many trade-show exhibitors register
// HubSpot records on a divisional subdomain (e.g. "labs.acme.com"), and
// stripping would cause cross-matches.

export function extractRegistrableDomain(websiteUrl: string | null | undefined): string | null {
  if (!websiteUrl) return null;
  const trimmed = websiteUrl.trim();
  if (!trimmed) return null;

  // Two-pass parse: try as-is first so we can detect non-http schemes
  // (mailto:, ftp:, tel: …) and reject them. Falling straight through to
  // `https://` + trimmed turned `mailto:foo@example.com` into a host of
  // example.com because the URL parser reads `mailto` as a userinfo segment.
  let parsed: URL | null = null;
  try {
    parsed = new URL(trimmed);
  } catch {
    /* fall through to second pass */
  }
  if (parsed) {
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return null;
  } else {
    try {
      parsed = new URL(`https://${trimmed}`);
    } catch {
      return null;
    }
  }

  let host = parsed.hostname.toLowerCase();
  if (!host) return null;
  if (host.startsWith("www.")) host = host.slice(4);
  // A bare token with no dot ("localhost", "intranet") is not a usable domain.
  if (!host.includes(".")) return null;
  return host;
}
