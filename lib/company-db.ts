import { CompanyDbListSchema, SyncResponseSchema } from "./schemas";
import type {
  CompanyDbCache,
  CompanyDbEntry,
  SyncResponse,
} from "./types";

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

export type SyncCompany = {
  name: string;
  country: string | null;
  employees?: number | null;
  industry?: string | null;
};

export async function syncToDB(
  companies: SyncCompany[],
  source: string,
): Promise<SyncResponse> {
  const res = await fetch(DB_URL + "/api/sync", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ companies, source }),
  });
  const json: unknown = await res.json();
  if (!res.ok) {
    const errMsg =
      typeof json === "object" &&
      json !== null &&
      "error" in json &&
      typeof (json as { error: unknown }).error === "string"
        ? (json as { error: string }).error
        : "Sync failed";
    throw new Error(errMsg);
  }
  return SyncResponseSchema.parse(json);
}
