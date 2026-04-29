import { z } from "zod";

export const AnthropicContentBlockSchema = z
  .object({
    type: z.string(),
    text: z.string().optional(),
  })
  .passthrough();

export const AnthropicResponseSchema = z
  .object({
    content: z.array(AnthropicContentBlockSchema),
  })
  .passthrough();

export const EnrichResultSchema = z.union([
  z.object({
    name: z.string(),
    matched: z.literal(true),
    employee_count: z.number().nullable(),
    employee_range: z.string().nullable(),
    industry: z.string().nullable(),
    revenue_range: z.string().nullable(),
    founded: z.number().nullable(),
    linkedin_url: z.string().nullable(),
    tags: z.array(z.string()),
  }),
  z.object({
    name: z.string(),
    matched: z.literal(false),
  }),
]);

export const EnrichResponseSchema = z.object({
  results: z.array(EnrichResultSchema),
});

export const RankedItemSchema = z.object({
  rank: z.number(),
  name: z.string(),
  country: z.string().optional().default(""),
  booth: z.string().optional().default(""),
  score: z.number(),
});

export const RankedArraySchema = z.array(RankedItemSchema);

export const ExtractedCompanySchema = z.object({
  name: z.string(),
  country: z.string().optional().default(""),
  booth: z.string().optional().default(""),
});

export const ExtractedCompaniesSchema = z.object({
  companies: z.array(ExtractedCompanySchema),
});

export const GuideStepSchema = z.object({
  title: z.string(),
  description: z.string(),
});

export const GuideObjectSchema = z.object({
  site_name: z.string().optional().default(""),
  platform: z.string().optional().default(""),
  difficulty: z.string().optional().default(""),
  steps: z.array(GuideStepSchema).default([]),
  tip: z.string().optional().nullable(),
});

export const CompanyDbEntrySchema = z
  .object({
    normalized: z.string(),
    raw: z.array(z.string()).default([]),
    country: z.string().nullable().optional(),
  })
  .passthrough();

export const CompanyDbListSchema = z.array(CompanyDbEntrySchema);

export const SyncResponseSchema = z.object({
  added: z.number(),
  updated: z.number(),
  total: z.number(),
});
