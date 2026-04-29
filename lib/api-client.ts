import { z } from "zod";
import {
  AnthropicResponseSchema,
  EnrichResponseSchema,
} from "./schemas";
import type { EnrichedCompany } from "./types";

export type AnthropicResponse = z.infer<typeof AnthropicResponseSchema>;

export type ApiFetchBody = {
  prompt: string;
  max_tokens?: number;
  model?: string;
  tools?: unknown[];
};

export async function apiFetch(
  body: ApiFetchBody,
  retries = 2,
): Promise<AnthropicResponse> {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetch("/api/score", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: body.prompt,
          max_tokens: body.max_tokens,
          model: body.model,
          tools: body.tools ?? undefined,
        }),
      });
      if (res.status === 529 || res.status === 429) {
        if (attempt < retries) {
          await new Promise((r) => setTimeout(r, 2000 * (attempt + 1)));
          continue;
        }
      }
      if (!res.ok) {
        const text = await res.text();
        throw new Error("API error " + res.status + ": " + text.slice(0, 200));
      }
      const json: unknown = await res.json();
      return AnthropicResponseSchema.parse(json);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (attempt < retries && message.includes("Failed to fetch")) {
        await new Promise((r) => setTimeout(r, 2000 * (attempt + 1)));
        continue;
      }
      throw err;
    }
  }
  throw new Error("apiFetch: exhausted retries without resolving");
}

export function extractTextFromAnthropic(res: AnthropicResponse): string {
  return res.content
    .filter((b) => b.type === "text")
    .map((b) => b.text ?? "")
    .join("");
}

export async function enrichCompanies(
  companies: { name: string; country?: string }[],
): Promise<EnrichedCompany[]> {
  try {
    const res = await fetch("/api/enrich", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ companies }),
    });
    if (!res.ok) throw new Error("Enrichment error " + res.status);
    const json: unknown = await res.json();
    const parsed = EnrichResponseSchema.parse(json);
    return parsed.results;
  } catch (err) {
    console.error("Enrichment failed:", err);
    return [];
  }
}
