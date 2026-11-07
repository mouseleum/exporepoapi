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
          ? `|employees:${e.employee_count ?? "?"}|industry:${e.industry ?? "?"}|revenue:${e.revenue_range ?? "?"}`
          : "";
      return `${i + 1}|${r.name}|${r.country}|${r.hall}${extras}`;
    })
    .join("\n");

  const countryWeightText = buildCountryWeightDirective(countryWeights);

  return `You are a B2B sales intelligence assistant for Mikael's, an AI-powered event lead capture platform. Mikael's sells to marketing managers and event managers at companies that exhibit regularly at trade shows.

Exhibitor list (index|name|country|booth|enrichment data if available):
${listText}

Rank the TOP ${topN} companies most worth targeting. Score each 1–100 based on:
1. Company size — use employee count and annual revenue when available; otherwise estimate from brand knowledge. Larger headcount and higher revenue both raise the score.
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

export type { ParsedRow };
