import { z } from "zod";
import { corsPreflight, jsonWithCors } from "@/lib/cors";

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

const PDL_URL = "https://api.peopledatalabs.com/v5/company/enrich";
const BATCH_SIZE = 5;
const BATCH_DELAY_MS = 200;

export async function OPTIONS(): Promise<Response> {
  return corsPreflight();
}

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

  for (let i = 0; i < companies.length; i += BATCH_SIZE) {
    const batch = companies.slice(i, i + BATCH_SIZE);
    const batchResults = await Promise.all(
      batch.map((c) => enrichOne(c, apiKey)),
    );
    results.push(...batchResults);

    if (i + BATCH_SIZE < companies.length) {
      await new Promise((r) => setTimeout(r, BATCH_DELAY_MS));
    }
  }

  return jsonWithCors({ results });
}

async function enrichOne(
  company: CompanyInput,
  apiKey: string,
): Promise<EnrichResult> {
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
      return { name: company.name, matched: false };
    }

    const data = (await response.json()) as Record<string, unknown>;
    return {
      name: company.name,
      matched: true,
      employee_count: (data.employee_count as number | null) ?? null,
      employee_range: (data.size as string | null) ?? null,
      industry: (data.industry as string | null) ?? null,
      revenue_range: (data.inferred_revenue as string | null) ?? null,
      founded: (data.founded as number | null) ?? null,
      linkedin_url: (data.linkedin_url as string | null) ?? null,
      tags: (data.tags as string[] | undefined) ?? [],
    };
  } catch {
    return { name: company.name, matched: false };
  }
}
