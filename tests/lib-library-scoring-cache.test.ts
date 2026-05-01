import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  clearScoringCache,
  loadScoringCache,
  saveScoringCache,
  type ScoringCacheEntry,
} from "../lib/library/scoring-cache";

const EVENT_ID = "evt-123";

const sample: ScoringCacheEntry = {
  ranked: [
    {
      rank: 1,
      name: "Acme",
      country: "US",
      hall: "5B",
      score: 91,
      employees: 200,
      industry: "tech",
    },
  ],
  weights: { US: 80 },
  targetCount: 25,
  scoredAt: "2026-05-01T10:00:00.000Z",
};

beforeEach(() => {
  window.localStorage.clear();
});
afterEach(() => {
  window.localStorage.clear();
});

describe("scoring-cache", () => {
  it("returns null when nothing is stored", () => {
    expect(loadScoringCache(EVENT_ID)).toBeNull();
  });

  it("save then load roundtrips the entry", () => {
    saveScoringCache(EVENT_ID, sample);
    const loaded = loadScoringCache(EVENT_ID);
    expect(loaded).toEqual(sample);
  });

  it("returns null when stored JSON is malformed", () => {
    window.localStorage.setItem("library:scored:" + EVENT_ID, "{not json");
    expect(loadScoringCache(EVENT_ID)).toBeNull();
  });

  it("returns null when stored value lacks required fields", () => {
    window.localStorage.setItem(
      "library:scored:" + EVENT_ID,
      JSON.stringify({ ranked: [], weights: {} }),
    );
    expect(loadScoringCache(EVENT_ID)).toBeNull();
  });

  it("clearScoringCache removes the entry", () => {
    saveScoringCache(EVENT_ID, sample);
    clearScoringCache(EVENT_ID);
    expect(loadScoringCache(EVENT_ID)).toBeNull();
  });

  it("entries are scoped per event id", () => {
    saveScoringCache(EVENT_ID, sample);
    expect(loadScoringCache("evt-other")).toBeNull();
  });
});
