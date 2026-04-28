import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { OPTIONS, POST } from "@/app/api/enrich/route";

function buildReq(body: unknown): Request {
  return new Request("http://test/api/enrich", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

describe("/api/enrich", () => {
  beforeEach(() => {
    process.env.PDL_API_KEY = "test-pdl-key";
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    delete process.env.PDL_API_KEY;
  });

  it("OPTIONS returns 200 with CORS headers", async () => {
    const res = await OPTIONS();
    expect(res.status).toBe(200);
    expect(res.headers.get("Access-Control-Allow-Origin")).toBe("*");
  });

  it("returns 500 when PDL_API_KEY missing", async () => {
    delete process.env.PDL_API_KEY;
    const res = await POST(buildReq({ companies: [{ name: "Acme" }] }));
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: "PDL_API_KEY not configured" });
  });

  it("returns 400 on missing companies", async () => {
    const res = await POST(buildReq({}));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "Missing companies array" });
  });

  it("returns 400 on empty companies array", async () => {
    const res = await POST(buildReq({ companies: [] }));
    expect(res.status).toBe(400);
  });

  it("maps PDL response on match with all fields", async () => {
    const pdl = {
      employee_count: 1234,
      size: "1001-5000",
      industry: "Industrial Machinery",
      inferred_revenue: "$100M-$500M",
      founded: 1990,
      linkedin_url: "linkedin.com/company/acme",
      tags: ["mfg", "europe"],
    };
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(new Response(JSON.stringify(pdl), { status: 200 })),
    );

    const res = await POST(
      buildReq({ companies: [{ name: "Acme", country: "DE" }] }),
    );
    expect(res.status).toBe(200);
    const data = (await res.json()) as { results: unknown[] };
    expect(data.results).toEqual([
      {
        name: "Acme",
        matched: true,
        employee_count: 1234,
        employee_range: "1001-5000",
        industry: "Industrial Machinery",
        revenue_range: "$100M-$500M",
        founded: 1990,
        linkedin_url: "linkedin.com/company/acme",
        tags: ["mfg", "europe"],
      },
    ]);
  });

  it("returns matched: false on upstream non-200", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response("not found", { status: 404 })),
    );
    const res = await POST(buildReq({ companies: [{ name: "Unknown" }] }));
    const data = (await res.json()) as { results: unknown[] };
    expect(data.results).toEqual([{ name: "Unknown", matched: false }]);
  });

  it("returns matched: false on fetch throw", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(new Error("network")),
    );
    const res = await POST(buildReq({ companies: [{ name: "Acme" }] }));
    const data = (await res.json()) as { results: unknown[] };
    expect(data.results).toEqual([{ name: "Acme", matched: false }]);
  });

  it("appends location only when country present", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response(JSON.stringify({}), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    await POST(
      buildReq({
        companies: [
          { name: "WithCountry", country: "DE" },
          { name: "NoCountry" },
        ],
      }),
    );

    const urls = fetchMock.mock.calls.map((c) => c[0] as string);
    expect(urls[0]).toContain("location=DE");
    expect(urls[0]).toContain("name=WithCountry");
    expect(urls[1]).not.toContain("location=");
    expect(urls[1]).toContain("name=NoCountry");
  });

  it("processes batches larger than batch size", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response(JSON.stringify({}), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const companies = Array.from({ length: 7 }, (_, i) => ({
      name: `Co${i}`,
    }));
    const res = await POST(buildReq({ companies }));
    const data = (await res.json()) as { results: unknown[] };
    expect(res.status).toBe(200);
    expect(data.results).toHaveLength(7);
    expect(fetchMock).toHaveBeenCalledTimes(7);
  });

  it("missing optional PDL fields default to null / empty array", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response(JSON.stringify({}), { status: 200 })),
    );

    const res = await POST(buildReq({ companies: [{ name: "Sparse" }] }));
    const data = (await res.json()) as { results: unknown[] };
    expect(data.results[0]).toEqual({
      name: "Sparse",
      matched: true,
      employee_count: null,
      employee_range: null,
      industry: null,
      revenue_range: null,
      founded: null,
      linkedin_url: null,
      tags: [],
    });
  });
});
