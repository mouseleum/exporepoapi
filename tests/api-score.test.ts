import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  DELETE,
  GET,
  HEAD,
  OPTIONS,
  PATCH,
  POST,
  PUT,
} from "@/app/api/score/route";

function buildReq(body: unknown): Request {
  return new Request("http://test/api/score", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

describe("/api/score", () => {
  beforeEach(() => {
    process.env.ANTHROPIC_API_KEY = "test-key";
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    delete process.env.ANTHROPIC_API_KEY;
  });

  it("OPTIONS returns 200 with CORS headers", async () => {
    const res = await OPTIONS();
    expect(res.status).toBe(200);
    expect(res.headers.get("Access-Control-Allow-Origin")).toBe("*");
    expect(res.headers.get("Access-Control-Allow-Methods")).toBe(
      "POST, OPTIONS",
    );
  });

  it("returns 500 when ANTHROPIC_API_KEY missing", async () => {
    delete process.env.ANTHROPIC_API_KEY;
    const res = await POST(buildReq({ prompt: "hi" }));
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({
      error: "ANTHROPIC_API_KEY not configured",
    });
  });

  it("returns 400 'Missing prompt' when prompt absent", async () => {
    const res = await POST(buildReq({}));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "Missing prompt" });
  });

  it("returns 400 'Missing prompt' when body is invalid JSON", async () => {
    const res = await POST(buildReq("not json"));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "Missing prompt" });
  });

  it("forwards to Anthropic and returns body verbatim on 200", async () => {
    const upstreamBody = { content: [{ type: "text", text: "hello" }] };
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        new Response(JSON.stringify(upstreamBody), { status: 200 }),
      );
    vi.stubGlobal("fetch", fetchMock);

    const res = await POST(buildReq({ prompt: "hi" }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(upstreamBody);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://api.anthropic.com/v1/messages");
    expect(init.method).toBe("POST");
    const headers = init.headers as Record<string, string>;
    expect(headers["x-api-key"]).toBe("test-key");
    expect(headers["anthropic-version"]).toBe("2023-06-01");

    const sent = JSON.parse(init.body as string) as {
      model: string;
      max_tokens: number;
      messages: Array<{ role: string; content: string }>;
      tools?: unknown;
    };
    expect(sent.model).toBe("claude-sonnet-4-20250514");
    expect(sent.max_tokens).toBe(2000);
    expect(sent.messages).toEqual([{ role: "user", content: "hi" }]);
    expect(sent.tools).toBeUndefined();
  });

  it("respects model, max_tokens, and tools overrides", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response(JSON.stringify({}), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    await POST(
      buildReq({
        prompt: "go",
        model: "claude-haiku-4-5-20251001",
        max_tokens: 4000,
        tools: [{ type: "web_search_20250305", name: "web_search" }],
      }),
    );

    const init = fetchMock.mock.calls[0]?.[1] as RequestInit;
    const sent = JSON.parse(init.body as string);
    expect(sent.model).toBe("claude-haiku-4-5-20251001");
    expect(sent.max_tokens).toBe(4000);
    expect(sent.tools).toEqual([
      { type: "web_search_20250305", name: "web_search" },
    ]);
  });

  it("propagates upstream status and truncates error text to 300 chars", async () => {
    const longErr = "X".repeat(500);
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response(longErr, { status: 529 })),
    );

    const res = await POST(buildReq({ prompt: "hi" }));
    expect(res.status).toBe(529);
    const body = (await res.json()) as { error: string };
    expect(body.error.length).toBe(300);
    expect(body.error).toBe("X".repeat(300));
  });

  it("returns 500 on upstream fetch throw", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(new Error("Network down")),
    );
    const res = await POST(buildReq({ prompt: "hi" }));
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: "Network down" });
  });

  it.each([
    ["GET", GET],
    ["PUT", PUT],
    ["DELETE", DELETE],
    ["PATCH", PATCH],
    ["HEAD", HEAD],
  ])("%s returns 405 with error body and CORS headers", async (_name, fn) => {
    const res = await fn();
    expect(res.status).toBe(405);
    expect(await res.json()).toEqual({ error: "Method not allowed" });
    expect(res.headers.get("Access-Control-Allow-Origin")).toBe("*");
    expect(res.headers.get("Access-Control-Allow-Methods")).toBe(
      "POST, OPTIONS",
    );
    expect(res.headers.get("Access-Control-Allow-Headers")).toBe(
      "Content-Type",
    );
  });
});
