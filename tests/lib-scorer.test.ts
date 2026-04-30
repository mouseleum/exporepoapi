import { afterEach, describe, expect, it, vi } from "vitest";
import { scoreCompanies, type ScorableCompany } from "../lib/scorer";

type FetchMock = ReturnType<typeof vi.fn>;

function mockFetch(textReturn: string): FetchMock {
  const fn = vi.fn(async () => ({
    ok: true,
    status: 200,
    json: async () => ({
      content: [{ type: "text", text: textReturn }],
    }),
    text: async () => "",
  }));
  vi.stubGlobal("fetch", fn);
  return fn;
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("scoreCompanies", () => {
  it("returns [] for empty input without calling fetch", async () => {
    const fn = mockFetch("[]");
    const out = await scoreCompanies([], {
      topN: 10,
      countryWeights: {},
    });
    expect(out).toEqual([]);
    expect(fn).not.toHaveBeenCalled();
  });

  it("happy path: ranks/scores intact, country/hall/enrichment preserved", async () => {
    const rows: ScorableCompany[] = [
      {
        name: "Signify",
        country: "Netherlands",
        hall: "5B116",
        employees: 68000,
        industry: "hospital & health care",
      },
      { name: "Acme", country: "US", hall: "" },
      { name: "OnlyName" },
    ];
    mockFetch(
      JSON.stringify([
        { rank: 1, name: "Signify", country: "", booth: "", score: 95 },
        { rank: 2, name: "Acme", country: "", booth: "", score: 80 },
        { rank: 3, name: "OnlyName", country: "", booth: "", score: 50 },
      ]),
    );

    const out = await scoreCompanies(rows, {
      topN: 3,
      countryWeights: {},
    });

    expect(out).toHaveLength(3);
    expect(out[0]).toEqual({
      rank: 1,
      name: "Signify",
      country: "Netherlands",
      hall: "5B116",
      score: 95,
      employees: 68000,
      industry: "hospital & health care",
    });
    expect(out[1]).toMatchObject({
      rank: 2,
      name: "Acme",
      country: "US",
      hall: "",
      employees: null,
      industry: null,
    });
    expect(out[2]).toMatchObject({
      rank: 3,
      name: "OnlyName",
      country: "",
      hall: "",
    });
  });

  it("Claude-supplied country/booth take precedence over input", async () => {
    const rows: ScorableCompany[] = [
      { name: "Signify", country: "Netherlands", hall: "" },
    ];
    mockFetch(
      JSON.stringify([
        { rank: 1, name: "Signify", country: "NL", booth: "Hall 7", score: 90 },
      ]),
    );
    const out = await scoreCompanies(rows, { topN: 1, countryWeights: {} });
    expect(out[0]?.country).toBe("NL");
    expect(out[0]?.hall).toBe("Hall 7");
  });

  it("truncates ranked output to topN", async () => {
    const rows: ScorableCompany[] = Array.from({ length: 5 }, (_, i) => ({
      name: `Co${i + 1}`,
    }));
    mockFetch(
      JSON.stringify(
        Array.from({ length: 5 }, (_, i) => ({
          rank: i + 1,
          name: `Co${i + 1}`,
          country: "",
          booth: "",
          score: 100 - i,
        })),
      ),
    );
    const out = await scoreCompanies(rows, { topN: 3, countryWeights: {} });
    expect(out).toHaveLength(3);
    expect(out.map((r) => r.name)).toEqual(["Co1", "Co2", "Co3"]);
  });

  it("falls back to substring name match for country/hall", async () => {
    const rows: ScorableCompany[] = [{ name: "Acme", country: "US", hall: "A1" }];
    mockFetch(
      JSON.stringify([
        { rank: 1, name: "Acme Inc.", country: "", booth: "", score: 90 },
      ]),
    );
    const out = await scoreCompanies(rows, { topN: 1, countryWeights: {} });
    expect(out[0]?.country).toBe("US");
    expect(out[0]?.hall).toBe("A1");
  });

  it("synthetic enrichment reaches the prompt for rows with employees/industry", async () => {
    const rows: ScorableCompany[] = [
      {
        name: "Signify",
        country: "Netherlands",
        employees: 68000,
        industry: "healthcare",
      },
    ];
    const fn = mockFetch(
      JSON.stringify([
        { rank: 1, name: "Signify", country: "", booth: "", score: 90 },
      ]),
    );
    await scoreCompanies(rows, { topN: 1, countryWeights: {} });

    expect(fn).toHaveBeenCalledTimes(1);
    const call = fn.mock.calls[0];
    expect(call).toBeDefined();
    const init = call![1] as RequestInit;
    const body = JSON.parse(String(init.body)) as {
      prompt: string;
      model: string;
      max_tokens: number;
    };
    expect(body.prompt).toContain("|employees:68000|industry:healthcare");
    expect(body.model).toBe("claude-sonnet-4-20250514");
    expect(body.max_tokens).toBe(830);
  });

  it("throws 'Unexpected response format.' when no JSON array found", async () => {
    mockFetch("Sorry, I cannot rank companies right now.");
    await expect(
      scoreCompanies([{ name: "Acme" }], {
        topN: 1,
        countryWeights: {},
      }),
    ).rejects.toThrow("Unexpected response format.");
  });

  it("respects custom model and maxTokens", async () => {
    const fn = mockFetch(
      JSON.stringify([
        { rank: 1, name: "X", country: "", booth: "", score: 50 },
      ]),
    );
    await scoreCompanies([{ name: "X" }], {
      topN: 1,
      countryWeights: {},
      model: "claude-haiku-4-5-20251001",
      maxTokens: 500,
    });
    const init = fn.mock.calls[0]![1] as RequestInit;
    const body = JSON.parse(String(init.body)) as {
      model: string;
      max_tokens: number;
    };
    expect(body.model).toBe("claude-haiku-4-5-20251001");
    expect(body.max_tokens).toBe(500);
  });
});
