import { z } from "zod";
import { corsPreflight, jsonWithCors } from "@/lib/cors";

const ScoreRequestSchema = z.object({
  prompt: z.string().min(1),
  max_tokens: z.number().int().positive().optional(),
  model: z.string().optional(),
  tools: z.array(z.unknown()).optional(),
});

const DEFAULT_MODEL = "claude-sonnet-4-20250514";
const DEFAULT_MAX_TOKENS = 2000;
const ANTHROPIC_VERSION = "2023-06-01";
const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";

export async function OPTIONS(): Promise<Response> {
  return corsPreflight();
}

export async function POST(req: Request): Promise<Response> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return jsonWithCors({ error: "ANTHROPIC_API_KEY not configured" }, 500);
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return jsonWithCors({ error: "Missing prompt" }, 400);
  }

  const parsed = ScoreRequestSchema.safeParse(body);
  if (!parsed.success) {
    const missingPrompt = parsed.error.issues.some(
      (i) => i.path[0] === "prompt",
    );
    if (missingPrompt) {
      return jsonWithCors({ error: "Missing prompt" }, 400);
    }
    return jsonWithCors(
      { error: "Invalid request body", issues: parsed.error.issues },
      400,
    );
  }

  const { prompt, max_tokens, model, tools } = parsed.data;

  const upstreamBody: Record<string, unknown> = {
    model: model ?? DEFAULT_MODEL,
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
      return jsonWithCors({ error: errText.slice(0, 300) }, response.status);
    }

    const data = await response.json();
    return jsonWithCors(data);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return jsonWithCors({ error: message }, 500);
  }
}
