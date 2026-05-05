import { enrichCompanies } from "./api-client";
import { loadDB, lookupInDB, syncToDB } from "./company-db";
import { scoreCompanies, type ScorableCompany } from "./scorer";
import type {
  CountryWeights,
  EnrichedCompany,
  RankedRow,
  Status,
} from "./types";

export type PipelineRow = {
  name: string;
  country?: string | null;
  hall?: string | null;
};

export type PipelineOptions = {
  topN: number;
  countryWeights: CountryWeights;
  source: string;
  prefilledEnriched?: Record<string, EnrichedCompany>;
  skipDbCountryFill?: boolean;
};

export type PipelineCallbacks = {
  onStatus: (s: Status) => void;
  onResults?: (final: RankedRow[]) => void;
};

const PDL_BATCH_SIZE = 20;

function nameKey(s: string): string {
  return s.toLowerCase().trim();
}

export async function runScoringPipeline(
  inputRows: PipelineRow[],
  options: PipelineOptions,
  callbacks: PipelineCallbacks,
): Promise<RankedRow[]> {
  const rows = inputRows.map((r) => ({
    name: r.name,
    country: r.country ?? "",
    hall: r.hall ?? "",
  }));

  if (!options.skipDbCountryFill) {
    callbacks.onStatus({
      kind: "loading",
      message: "Checking company database...",
    });
    const db = await loadDB();
    for (const r of rows) {
      if (!r.country) {
        const hit = lookupInDB(r.name, db);
        if (hit?.country) r.country = hit.country;
      }
    }
  }
  const dbHits = rows.filter((r) => r.country).length;

  callbacks.onStatus({
    kind: "loading",
    message: `DB filled ${dbHits} countries. Enriching with PeopleDataLabs...`,
  });

  const enrichedMap: Record<string, EnrichedCompany> = {
    ...(options.prefilledEnriched ?? {}),
  };
  const toEnrich = rows.filter((r) => !enrichedMap[nameKey(r.name)]);

  for (let i = 0; i < toEnrich.length; i += PDL_BATCH_SIZE) {
    const batch = toEnrich
      .slice(i, i + PDL_BATCH_SIZE)
      .map((r) => ({ name: r.name, country: r.country }));
    callbacks.onStatus({
      kind: "loading",
      message: `Enriching companies... (${Math.min(
        i + PDL_BATCH_SIZE,
        toEnrich.length,
      )}/${toEnrich.length})`,
    });
    try {
      const results = await enrichCompanies(batch);
      for (const r of results) {
        if (r.matched) enrichedMap[nameKey(r.name)] = r;
      }
    } catch {
      /* continue without enrichment */
    }
  }

  const enrichedCount = Object.keys(enrichedMap).length;
  callbacks.onStatus({
    kind: "loading",
    message: `Enriched ${enrichedCount}/${rows.length} companies. Scoring with AI...`,
  });

  const scorable: ScorableCompany[] = rows.map((r) => {
    const e = enrichedMap[nameKey(r.name)];
    return {
      name: r.name,
      country: r.country,
      hall: r.hall,
      employees: e && e.matched ? e.employee_count : null,
      industry: e && e.matched ? e.industry : null,
      revenue: e && e.matched ? e.revenue_range : null,
    };
  });
  const final = await scoreCompanies(scorable, {
    topN: options.topN,
    countryWeights: options.countryWeights,
  });

  callbacks.onResults?.(final);

  const syncPayload = rows.map((r) => {
    const e = enrichedMap[nameKey(r.name)];
    return {
      name: r.name,
      country: r.country || null,
      employees: e && e.matched ? e.employee_count : null,
      industry: e && e.matched ? e.industry : null,
    };
  });
  try {
    const result = await syncToDB(syncPayload, options.source);
    callbacks.onStatus({
      kind: "info",
      message: `✓ Synced to company DB — ${result.added} new, ${result.updated} updated (${result.total} total)`,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    callbacks.onStatus({
      kind: "error",
      message: "DB sync error: " + message,
    });
  }

  return final;
}
