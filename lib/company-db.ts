import { CompanyDbListSchema } from "./schemas";
import type { CompanyDbCache, CompanyDbEntry } from "./types";

// Phase C of the company-db-agent merge (docs/company-db-merge.md):
// loadDB() now fetches from this app's own /api/company-db (backed by
// Supabase), not from the standalone. Relative URL works in the browser
// (both callers are "use client") and in any SSR context that polyfills
// fetch with an origin.

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

export type CompanyDbSyncInput = {
  name: string;
  country?: string | null;
  employees?: number | null;
  industry?: string | null;
};

export type CompanyDbSyncResult = {
  added: number;
  updated: number;
  total: number;
};

export async function pushCompaniesToDb(
  _companies: CompanyDbSyncInput[],
  _source: string,
): Promise<CompanyDbSyncResult> {
  // No-op stub. Phase C cut over the read path to Supabase; the standalone
  // company-db-agent is no longer the source of truth, so pushing to it is
  // pointless. syncCompaniesToDb (Supabase) is now the only write path.
  // Kept callable so Phase E's deletion is the only thing left to do.
  return { added: 0, updated: 0, total: 0 };
}

