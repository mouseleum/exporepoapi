import type { CountryWeights, EnrichedCompany, ParsedRow } from "./types";
import { buildCountryWeightDirective } from "./country-weights";

export type RankerRow = {
  name: string;
  country: string;
  hall: string;
};

export function buildRankerPrompt(
  rows: RankerRow[],
  enrichedMap: Record<string, EnrichedCompany>,
  topN: number,
  countryWeights: CountryWeights,
): string {
  const listText = rows
    .map((r, i) => {
      const e = enrichedMap[r.name.toLowerCase().trim()];
      const extras =
        e && e.matched
          ? `|employees:${e.employee_count ?? "?"}|industry:${e.industry ?? "?"}`
          : "";
      return `${i + 1}|${r.name}|${r.country}|${r.hall}${extras}`;
    })
    .join("\n");

  const countryWeightText = buildCountryWeightDirective(countryWeights);

  return `You are a B2B sales intelligence assistant for eXpotential, an AI-powered event lead capture platform. eXpotential sells to marketing managers and event managers at companies that exhibit regularly at trade shows.

Exhibitor list (index|name|country|booth|enrichment data if available):
${listText}

Rank the TOP ${topN} companies most worth targeting. Score each 1–100 based on:
1. Company size — use employee count data when available, otherwise estimate from brand knowledge. Larger = higher score.
2. Industry fit — companies in manufacturing, technology, events, pharma, automotive, energy, and industrial sectors score higher
3. Likelihood to exhibit at trade shows regularly — based on industry, company type, brand signals
4. Known major global brands always score 80+${countryWeightText}

Return ONLY a valid JSON array, no markdown, no explanation. Copy the name, country and booth EXACTLY as they appear in the input:
[{"rank":1,"name":"Exact Company Name","country":"US","booth":"5B116","score":95}]
Exactly ${topN} items maximum.`;
}

export function buildPdfExtractPrompt(
  chunk: string,
  index: number,
  total: number,
): string {
  return `Extract every company/exhibitor from this section of a trade show exhibitor list PDF.

PDF TEXT SECTION ${index}/${total}:
${chunk}

Return ONLY valid JSON, no markdown:
{"companies":[{"name":"Company Name","country":"Country or empty string","booth":"Stand/Booth number or empty string"}]}
Extract every company you can find. If unsure whether something is a company name, include it.`;
}

export function buildGuidePrompt(url: string): string {
  return `You are a practical trade show research assistant for eXpotential.

The user wants to download the full exhibitor list from this trade show website:
URL: ${url}

Use web search to find the exhibitor list page and analyse how the site works. Look for:
- Direct download buttons (PDF, CSV, Excel export)
- The platform the directory runs on (Swapcard, Coconnex, Mappedin, Explori, etc.)
- Pagination structure
- Any API endpoints that return exhibitor data

Then generate clear step-by-step instructions to get the full exhibitor list as a file (CSV, Excel, or PDF) that can be uploaded to the eXpotential Ranker.

Be specific: mention exact button names, URLs, menu items. If there's no export, suggest the most practical workaround (copy-paste, contacting the organiser, browser extension).

Return ONLY valid JSON, no markdown:
{
  "site_name": "Name of the show",
  "platform": "Platform name if recognisable (Swapcard, Coconnex, Mappedin, custom, etc.)",
  "difficulty": "Easy / Medium / Hard",
  "steps": [
    {"title": "Short title", "description": "Clear instruction mentioning exact button names, URLs, or menu items."}
  ],
  "tip": "One practical tip or warning about this specific site"
}`;
}

export type { ParsedRow };
