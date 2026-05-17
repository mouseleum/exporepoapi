import { z } from "zod";
import { corsPreflight, jsonWithCors, methodNotAllowed } from "@/lib/cors";

const CompanyInputSchema = z.object({
  name: z.string().min(1),
  country: z.string().optional(),
});

const EnrichRequestSchema = z.object({
  companies: z.array(CompanyInputSchema).min(1),
});

type CompanyInput = z.infer<typeof CompanyInputSchema>;

type EnrichResult =
  | {
      name: string;
      matched: true;
      employee_count: number | null;
      employee_range: string | null;
      industry: string | null;
      revenue_range: string | null;
      founded: number | null;
      linkedin_url: string | null;
      tags: string[];
    }
  | { name: string; matched: false };

type EnrichOneOutcome = {
  result: EnrichResult;
  quotaExhausted?: { message: string };
};

const PDL_URL = "https://api.peopledatalabs.com/v5/company/enrich";
const BATCH_SIZE = 5;
const BATCH_DELAY_MS = 200;

export async function OPTIONS(): Promise<Response> {
  return corsPreflight();
}

export const GET = methodNotAllowed;
export const PUT = methodNotAllowed;
export const DELETE = methodNotAllowed;
export const PATCH = methodNotAllowed;
export const HEAD = methodNotAllowed;

export async function POST(req: Request): Promise<Response> {
  const apiKey = process.env.PDL_API_KEY;
  if (!apiKey) {
    return jsonWithCors({ error: "PDL_API_KEY not configured" }, 500);
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return jsonWithCors({ error: "Missing companies array" }, 400);
  }

  const parsed = EnrichRequestSchema.safeParse(body);
  if (!parsed.success) {
    return jsonWithCors({ error: "Missing companies array" }, 400);
  }

  const { companies } = parsed.data;
  const results: EnrichResult[] = [];
  let quotaExhausted: { message: string } | undefined;

  for (let i = 0; i < companies.length; i += BATCH_SIZE) {
    if (quotaExhausted) {
      // Once PDL says "all matches used", every following call returns the
      // same 402 — emit unmatched placeholders without spending the rest of
      // the round trips.
      for (const c of companies.slice(i)) {
        results.push({ name: c.name, matched: false });
      }
      break;
    }
    const batch = companies.slice(i, i + BATCH_SIZE);
    const outcomes = await Promise.all(
      batch.map((c) => enrichOne(c, apiKey)),
    );
    for (const o of outcomes) {
      results.push(o.result);
      if (o.quotaExhausted && !quotaExhausted) quotaExhausted = o.quotaExhausted;
    }

    if (i + BATCH_SIZE < companies.length) {
      await new Promise((r) => setTimeout(r, BATCH_DELAY_MS));
    }
  }

  return jsonWithCors({
    results,
    quota_exhausted: !!quotaExhausted,
    quota_message: quotaExhausted?.message,
  });
}

async function enrichOne(
  company: CompanyInput,
  apiKey: string,
): Promise<EnrichOneOutcome> {
  const params = new URLSearchParams({
    name: company.name,
    api_key: apiKey,
  });
  if (company.country) params.append("location", company.country);

  try {
    const response = await fetch(`${PDL_URL}?${params.toString()}`, {
      method: "GET",
      headers: { Accept: "application/json" },
    });

    if (response.status !== 200) {
      // 402 with "all matches used" means the free-tier lifetime quota is
      // gone. 429 means the per-minute budget is gone. Both are fatal for the
      // rest of this run — bubble up so the caller can stop early.
      if (response.status === 402 || response.status === 429) {
        let message = `PDL HTTP ${response.status}`;
        try {
          const body = (await response.json()) as {
            error?: { message?: string };
          };
          if (body.error?.message) message = body.error.message;
        } catch {
          /* leave the default message */
        }
        return {
          result: { name: company.name, matched: false },
          quotaExhausted: { message },
        };
      }
      return { result: { name: company.name, matched: false } };
    }

    const data = (await response.json()) as Record<string, unknown>;
    return {
      result: {
        name: company.name,
        matched: true,
        employee_count: (data.employee_count as number | null) ?? null,
        employee_range: (data.size as string | null) ?? null,
        industry: (data.industry as string | null) ?? null,
        revenue_range: (data.inferred_revenue as string | null) ?? null,
        founded: (data.founded as number | null) ?? null,
        linkedin_url: (data.linkedin_url as string | null) ?? null,
        tags: (data.tags as string[] | undefined) ?? [],
      },
    };
  } catch {
    return { result: { name: company.name, matched: false } };
  }
}
