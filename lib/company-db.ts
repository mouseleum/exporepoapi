import { CompanyDbListSchema } from "./schemas";
import type { CompanyDbCache, CompanyDbEntry } from "./types";

const DB_URL = "https://company-db-agent.vercel.app";

let dbCache: CompanyDbCache | null = null;

export async function loadDB(): Promise<CompanyDbCache | null> {
  if (dbCache) return dbCache;
  try {
    const res = await fetch(DB_URL + "/api/companies");
    if (!res.ok) return null;
    const json: unknown = await res.json();
    const companies = CompanyDbListSchema.parse(json);
    const byRaw = new Map<string, CompanyDbEntry>();
    const byNormalized = new Map<string, CompanyDbEntry>();
    for (const c of companies) {
      if (!c.country) continue;
      const entry: CompanyDbEntry = {
        normalized: c.normalized,
        raw: c.raw,
        country: c.country,
      };
      for (const raw of c.raw) {
        byRaw.set(raw.toLowerCase().trim(), entry);
      }
      byNormalized.set(c.normalized.toLowerCase().trim(), entry);
    }
    dbCache = { byRaw, byNormalized };
    return dbCache;
  } catch {
    return null;
  }
}

export function lookupInDB(
  name: string,
  db: CompanyDbCache | null,
): CompanyDbEntry | null {
  if (!db) return null;
  const key = name.toLowerCase().trim();
  return db.byRaw.get(key) ?? db.byNormalized.get(key) ?? null;
}

