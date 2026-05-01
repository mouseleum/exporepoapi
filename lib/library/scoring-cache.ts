import type { CountryWeights, RankedRow } from "../types";

export type ScoringCacheEntry = {
  ranked: RankedRow[];
  weights: CountryWeights;
  targetCount: number;
  scoredAt: string;
};

const KEY_PREFIX = "library:scored:";

function key(eventId: string): string {
  return KEY_PREFIX + eventId;
}

function safeStorage(): Storage | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

export function loadScoringCache(eventId: string): ScoringCacheEntry | null {
  const storage = safeStorage();
  if (!storage) return null;
  const raw = storage.getItem(key(eventId));
  if (!raw) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (
      typeof parsed === "object" &&
      parsed !== null &&
      "ranked" in parsed &&
      "weights" in parsed &&
      "targetCount" in parsed &&
      "scoredAt" in parsed
    ) {
      return parsed as ScoringCacheEntry;
    }
    return null;
  } catch {
    return null;
  }
}

export function saveScoringCache(
  eventId: string,
  entry: ScoringCacheEntry,
): void {
  const storage = safeStorage();
  if (!storage) return;
  try {
    storage.setItem(key(eventId), JSON.stringify(entry));
  } catch {
    // quota / private mode — silently drop
  }
}

export function clearScoringCache(eventId: string): void {
  const storage = safeStorage();
  if (!storage) return;
  try {
    storage.removeItem(key(eventId));
  } catch {
    // ignore
  }
}
