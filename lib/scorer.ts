import {
  apiFetch,
  extractTextFromAnthropic,
  type AnthropicResponse,
} from "./api-client";
import { buildRankerPrompt } from "./prompts";
import { RankedArraySchema } from "./schemas";
import type {
  CountryWeights,
  EnrichedCompany,
  RankedRow,
} from "./types";

export type ScorableCompany = {
  name: string;
  country?: string | null;
  hall?: string | null;
  employees?: number | null;
  industry?: string | null;
};

export type ScoreOptions = {
  topN: number;
  countryWeights: CountryWeights;
  model?: string;
  maxTokens?: number;
};

const DEFAULT_MODEL = "claude-sonnet-4-20250514";

function defaultMaxTokens(topN: number): number {
  return Math.min(4000, 800 + topN * 30);
}

function key(name: string): string {
  return name.toLowerCase().trim();
}

function syntheticEnrichment(
  rows: ScorableCompany[],
): Record<string, EnrichedCompany> {
  const map: Record<string, EnrichedCompany> = {};
  for (const r of rows) {
    if (r.employees == null && !r.industry) continue;
    map[key(r.name)] = {
      name: r.name,
      matched: true,
      employee_count: r.employees ?? null,
      employee_range: null,
      industry: r.industry ?? null,
      revenue_range: null,
      founded: null,
      linkedin_url: null,
      tags: [],
    };
  }
  return map;
}

export async function scoreCompanies(
  rows: ScorableCompany[],
  options: ScoreOptions,
): Promise<RankedRow[]> {
  if (rows.length === 0) return [];

  const enrichedMap = syntheticEnrichment(rows);
  const rankerRows = rows.map((r) => ({
    name: r.name,
    country: r.country ?? "",
    hall: r.hall ?? "",
  }));

  const prompt = buildRankerPrompt(
    rankerRows,
    enrichedMap,
    options.topN,
    options.countryWeights,
  );

  const data: AnthropicResponse = await apiFetch({
    model: options.model ?? DEFAULT_MODEL,
    max_tokens: options.maxTokens ?? defaultMaxTokens(options.topN),
    prompt,
  });

  const responseText = extractTextFromAnthropic(data);
  const jsonMatch = responseText.match(/\[[\s\S]*\]/);
  if (!jsonMatch) throw new Error("Unexpected response format.");
  const ranked = RankedArraySchema.parse(JSON.parse(jsonMatch[0]));

  const nameMap: Record<string, ScorableCompany> = {};
  for (const r of rows) nameMap[key(r.name)] = r;

  return ranked.slice(0, options.topN).map((item) => {
    const k = key(item.name);
    const match =
      nameMap[k] ??
      rows.find(
        (r) =>
          r.name.toLowerCase().includes(k) ||
          k.includes(r.name.toLowerCase()),
      );
    const e = enrichedMap[k];
    const employees = e?.matched ? e.employee_count : null;
    const industry = e?.matched ? e.industry : null;
    return {
      rank: item.rank,
      name: item.name,
      country: item.country || (match?.country ?? "") || "",
      hall: item.booth || (match?.hall ?? "") || "",
      score: item.score,
      employees,
      industry,
    };
  });
}
