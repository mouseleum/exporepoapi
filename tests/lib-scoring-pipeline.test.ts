import { afterEach, describe, expect, it, vi } from "vitest";

type SyncArgs = [Array<unknown>, string];
type SyncResult = { added: number; updated: number; total: number };
const syncMock = vi.fn<(...args: SyncArgs) => Promise<SyncResult>>(
  async () => ({ added: 1, updated: 0, total: 1 }),
);
vi.mock("@/app/library/actions", () => ({
  syncCompaniesToDb: (...args: SyncArgs) => syncMock(...args),
}));

const { runScoringPipeline } = await import("../lib/scoring-pipeline");
import type { Status } from "../lib/types";

type Init = RequestInit | undefined;

type FetchMockOpts = {
  companyDb?: {
    companies: Array<{ normalized: string; raw: string[]; country: string }>;
  };
  pdl?: Array<{
    name: string;
    matched: boolean;
    employee_count?: number;
    industry?: string;
  }>;
  score?: Array<{
    rank: number;
    name: string;
    country: string;
    booth: string;
    score: number;
  }>;
};

type MockResponse = {
  ok: boolean;
  status: number;
  json: () => Promise<unknown>;
  text: () => Promise<string>;
};

function setupFetchMocks(opts: FetchMockOpts) {
  const calls: Array<{ url: string; init?: Init; body?: unknown }> = [];
  const fn = vi.fn(async (url: string, init?: Init): Promise<MockResponse> => {
    let body: unknown = undefined;
    if (init?.body) {
      try {
        body = JSON.parse(String(init.body));
      } catch {
        body = init.body;
      }
    }
    calls.push({ url, init, body });

    if (url.includes("company-db-agent.vercel.app/api/companies")) {
      return {
        ok: true,
        status: 200,
        json: async () => opts.companyDb?.companies ?? [],
        text: () => Promise.resolve(""),
      };
    }
    if (url.includes("/api/enrich")) {
      const enriched = (opts.pdl ?? []).map((p) =>
        p.matched
          ? {
              name: p.name,
              matched: true,
              employee_count: p.employee_count ?? null,
              employee_range: null,
              industry: p.industry ?? null,
              revenue_range: null,
              founded: null,
              linkedin_url: null,
              tags: [],
            }
          : { name: p.name, matched: false },
      );
      return {
        ok: true,
        status: 200,
        json: async () => ({ results: enriched }),
        text: () => Promise.resolve(""),
      };
    }
    if (url.includes("/api/score")) {
      const ranked = opts.score ?? [];
      return {
        ok: true,
        status: 200,
        json: async () => ({
          content: [{ type: "text", text: JSON.stringify(ranked) }],
        }),
        text: () => Promise.resolve(""),
      };
    }
    throw new Error(`unmocked URL: ${url}`);
  });
  vi.stubGlobal("fetch", fn);
  return { fn, calls };
}

function urlsCalled(calls: Array<{ url: string }>): string[] {
  return calls.map((c) => c.url);
}

afterEach(() => {
  vi.unstubAllGlobals();
  syncMock.mockReset();
  syncMock.mockResolvedValue({ added: 1, updated: 0, total: 1 });
});

describe("runScoringPipeline", () => {
  it("end-to-end: DB lookup → PDL → score → sync writeback", async () => {
    const { calls } = setupFetchMocks({
      companyDb: {
        companies: [
          { normalized: "acme", raw: ["acme"], country: "US" },
        ],
      },
      pdl: [
        { name: "Acme", matched: true, employee_count: 100, industry: "tech" },
      ],
      score: [
        { rank: 1, name: "Acme", country: "", booth: "", score: 90 },
      ],
    });

    const statuses: Status[] = [];
    const result = await runScoringPipeline(
      [{ name: "Acme" }],
      { topN: 1, countryWeights: {}, source: "test" },
      { onStatus: (s) => statuses.push(s) },
    );

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      rank: 1,
      name: "Acme",
      country: "US",
      employees: 100,
      industry: "tech",
    });

    const urls = urlsCalled(calls);
    expect(urls.some((u) => u.includes("/api/companies"))).toBe(true);
    expect(urls.some((u) => u.includes("/api/enrich"))).toBe(true);
    expect(urls.some((u) => u.includes("/api/score"))).toBe(true);
    expect(syncMock).toHaveBeenCalledTimes(1);
  });

  it("prefilledEnriched names skip PDL", async () => {
    const { calls } = setupFetchMocks({
      score: [{ rank: 1, name: "Acme", country: "US", booth: "", score: 80 }],
    });

    await runScoringPipeline(
      [{ name: "Acme", country: "US" }],
      {
        topN: 1,
        countryWeights: {},
        source: "test",
        prefilledEnriched: {
          acme: {
            name: "Acme",
            matched: true,
            employee_count: 500,
            employee_range: null,
            industry: "biotech",
            revenue_range: null,
            founded: null,
            linkedin_url: null,
            tags: [],
          },
        },
        skipDbCountryFill: true,
      },
      { onStatus: () => {} },
    );

    const urls = urlsCalled(calls);
    expect(urls.some((u) => u.includes("/api/enrich"))).toBe(false);
  });

  it("skipDbCountryFill: empty country stays empty when company DB would have filled it", async () => {
    setupFetchMocks({
      companyDb: {
        companies: [
          { normalized: "ghostco", raw: ["ghostco"], country: "DE" },
        ],
      },
      pdl: [{ name: "GhostCo", matched: false }],
      score: [{ rank: 1, name: "GhostCo", country: "", booth: "", score: 50 }],
    });

    const result = await runScoringPipeline(
      [{ name: "GhostCo" }],
      {
        topN: 1,
        countryWeights: {},
        source: "test",
        skipDbCountryFill: true,
      },
      { onStatus: () => {} },
    );

    expect(result[0]?.country).toBe("");
  });

  it("invokes onStatus through the expected stages", async () => {
    setupFetchMocks({
      pdl: [{ name: "X", matched: false }],
      score: [{ rank: 1, name: "X", country: "", booth: "", score: 50 }],
    });

    const messages: string[] = [];
    await runScoringPipeline(
      [{ name: "X" }],
      { topN: 1, countryWeights: {}, source: "test" },
      {
        onStatus: (s) => {
          if (s.kind !== "idle") messages.push(s.message);
        },
      },
    );

    expect(messages.some((m) => m.includes("Checking company database"))).toBe(
      true,
    );
    expect(messages.some((m) => m.includes("Enriching with PeopleDataLabs")))
      .toBe(true);
    expect(messages.some((m) => m.includes("Scoring with AI"))).toBe(true);
    expect(messages.some((m) => m.includes("Synced to company DB"))).toBe(true);
  });

  it("onResults fires before sync writeback completes", async () => {
    const events: string[] = [];
    setupFetchMocks({
      score: [{ rank: 1, name: "Y", country: "", booth: "", score: 60 }],
    });
    syncMock.mockResolvedValue({ added: 0, updated: 1, total: 5 });

    await runScoringPipeline(
      [{ name: "Y" }],
      { topN: 1, countryWeights: {}, source: "test" },
      {
        onStatus: (s) => {
          if (s.kind === "info" && s.message.includes("Synced")) {
            events.push("sync_status");
          }
        },
        onResults: () => events.push("results"),
      },
    );

    expect(events).toEqual(["results", "sync_status"]);
  });

  it("PDL fetch failure does not crash the pipeline", async () => {
    setupFetchMocks({
      score: [{ rank: 1, name: "Z", country: "", booth: "", score: 30 }],
    });
    vi.spyOn(console, "error").mockImplementation(() => {});

    const fn = globalThis.fetch as unknown as ReturnType<typeof vi.fn>;
    const original = fn.getMockImplementation() as
      | ((url: string, init?: Init) => Promise<unknown>)
      | undefined;
    fn.mockImplementation(async (url: string, init?: Init) => {
      if (url.includes("/api/enrich")) {
        throw new Error("network down");
      }
      if (!original) throw new Error("no original mock");
      return original(url, init);
    });

    const result = await runScoringPipeline(
      [{ name: "Z" }],
      { topN: 1, countryWeights: {}, source: "test" },
      { onStatus: () => {} },
    );
    expect(result[0]?.name).toBe("Z");
  });

  it("sync error surfaces as error status (does not throw)", async () => {
    setupFetchMocks({
      pdl: [{ name: "Q", matched: false }],
      score: [{ rank: 1, name: "Q", country: "", booth: "", score: 40 }],
    });
    syncMock.mockRejectedValue(new Error("sync boom"));

    const errorMessages: string[] = [];
    await runScoringPipeline(
      [{ name: "Q" }],
      { topN: 1, countryWeights: {}, source: "test" },
      {
        onStatus: (s) => {
          if (s.kind === "error") errorMessages.push(s.message);
        },
      },
    );

    expect(errorMessages.some((m) => m.includes("DB sync error"))).toBe(true);
  });

  it("source is forwarded to syncCompaniesToDb", async () => {
    setupFetchMocks({
      pdl: [{ name: "Foo", matched: false }],
      score: [{ rank: 1, name: "Foo", country: "", booth: "", score: 70 }],
    });

    await runScoringPipeline(
      [{ name: "Foo" }],
      { topN: 1, countryWeights: {}, source: "my-event-slug" },
      { onStatus: () => {} },
    );

    expect(syncMock).toHaveBeenCalledTimes(1);
    expect(syncMock.mock.calls[0]?.[1]).toBe("my-event-slug");
  });
});
