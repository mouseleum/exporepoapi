import { CompanyDbListSchema } from "./schemas";
import type { CompanyDbCache, CompanyDbEntry } from "./types";

// loadDB() fetches from /api/company-db (backed by Supabase). Relative
// URL works in the browser (both callers are "use client") and in any
// SSR context that polyfills fetch with an origin.

let dbCache: CompanyDbCache | null = null;

export async function loadDB(): Promise<CompanyDbCache | null> {
  if (dbCache) return dbCache;
  try {
    const res = await fetch("/api/company-db");
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
