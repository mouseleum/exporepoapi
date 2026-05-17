import { NextResponse } from "next/server";
import { z } from "zod";

// Anthropic models we actually use from the client. Others (including expensive
// claude-opus-* variants) are rejected at the gate so a stray client request
// can't pick a model that costs 10× ours.
const ALLOWED_MODELS = new Set<string>([
  "claude-sonnet-4-20250514",
  "claude-haiku-4-5-20251001",
]);
const DEFAULT_MODEL = "claude-sonnet-4-20250514";

// Tools the client is allowed to ask for. Web search is the only one in use
// today (components/guide/ListGuideTab.tsx sends web_search_20250305). New
// tools require a code change here, by design.
const ALLOWED_TOOL_TYPES = new Set<string>(["web_search_20250305"]);

// Hard caps to bound damage from a misbehaving (or malicious) client.
// Same-origin only by design — see lib/cors.ts deletion in commit history.
const MAX_PROMPT_CHARS = 200_000; // ~50k tokens worst case
const MAX_OUTPUT_TOKENS = 8_000;
const DEFAULT_MAX_TOKENS = 2000;

const ToolSchema = z
  .object({ type: z.string(), name: z.string().optional() })
  .passthrough();

const ScoreRequestSchema = z.object({
  prompt: z.string().min(1).max(MAX_PROMPT_CHARS),
  max_tokens: z.number().int().positive().max(MAX_OUTPUT_TOKENS).optional(),
  model: z.string().optional(),
  tools: z.array(ToolSchema).optional(),
});

const ANTHROPIC_VERSION = "2023-06-01";
const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";

export async function POST(req: Request): Promise<Response> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "ANTHROPIC_API_KEY not configured" },
      { status: 500 },
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Missing prompt" }, { status: 400 });
  }

  const parsed = ScoreRequestSchema.safeParse(body);
  if (!parsed.success) {
    // Distinguish "no prompt at all" from "prompt present but invalid" so
    // size-cap rejections don't hide behind a generic "Missing prompt" error.
    const missingPrompt = parsed.error.issues.some(
      (i) =>
        i.path[0] === "prompt" &&
        (i.code === "invalid_type" ||
          (i.code === "too_small" && (i as { minimum?: number }).minimum === 1)),
    );
    if (missingPrompt) {
      return NextResponse.json({ error: "Missing prompt" }, { status: 400 });
    }
    return NextResponse.json(
      { error: "Invalid request body", issues: parsed.error.issues },
      { status: 400 },
    );
  }

  const { prompt, max_tokens, model, tools } = parsed.data;

  const chosenModel = model ?? DEFAULT_MODEL;
  if (!ALLOWED_MODELS.has(chosenModel)) {
    return NextResponse.json(
      { error: `model_not_allowed: ${chosenModel}` },
      { status: 400 },
    );
  }

  if (tools) {
    const bad = tools.find((t) => !ALLOWED_TOOL_TYPES.has(t.type));
    if (bad) {
      return NextResponse.json(
        { error: `tool_type_not_allowed: ${bad.type}` },
        { status: 400 },
      );
    }
  }

  const upstreamBody: Record<string, unknown> = {
    model: chosenModel,
    max_tokens: max_tokens ?? DEFAULT_MAX_TOKENS,
    messages: [{ role: "user", content: prompt }],
  };
  if (tools) upstreamBody.tools = tools;

  try {
    const response = await fetch(ANTHROPIC_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": ANTHROPIC_VERSION,
      },
      body: JSON.stringify(upstreamBody),
    });

    if (!response.ok) {
      const errText = await response.text();
      return NextResponse.json(
        { error: errText.slice(0, 300) },
        { status: response.status },
      );
    }

    const data = await response.json();
    return NextResponse.json(data);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
