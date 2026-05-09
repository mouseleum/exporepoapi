import type { SupabaseClient } from "@supabase/supabase-js";
import { createServiceClient } from "../supabase";
import { normalizeName } from "../normalize";

export type ManualEditInput = {
  raw_name: string;
  country: string | null;
  employees: number | null;
  annual_revenue: number | null;
  industry: string | null;
};

export type ManualEditResult = {
  name_normalized: string;
  inserted: boolean;
};

const SHORTHAND_RE = /^([0-9]+(?:\.[0-9]+)?)\s*([kmb])?$/i;

export function parseRevenueShorthand(input: string): number | null {
  const trimmed = input.trim();
  if (!trimmed) return null;
  const cleaned = trimmed.replace(/[$,\s_]/g, "");
  const match = cleaned.match(SHORTHAND_RE);
  if (!match || !match[1]) return null;
  const value = parseFloat(match[1]);
  if (!Number.isFinite(value) || value < 0) return null;
  const suffix = match[2]?.toLowerCase();
  const multiplier =
    suffix === "b" ? 1_000_000_000 : suffix === "m" ? 1_000_000 : suffix === "k" ? 1_000 : 1;
  return Math.round(value * multiplier);
}

export async function saveManualCompanyEdit(
  input: ManualEditInput,
  supabase: SupabaseClient = createServiceClient(),
): Promise<ManualEditResult> {
  const raw_name = input.raw_name.trim();
  if (raw_name.length < 2) throw new Error("Company name is too short.");
  const name_normalized = normalizeName(raw_name);
  if (!name_normalized) throw new Error("Could not normalize company name.");

  const country = input.country?.trim() || null;
  const industry = input.industry?.trim() || null;
  const employees = input.employees ?? null;
  const annual_revenue = input.annual_revenue ?? null;

  const { data: existing, error: lookupErr } = await supabase
    .from("companies")
    .select("id")
    .eq("name_normalized", name_normalized)
    .maybeSingle();
  if (lookupErr) throw new Error(`saveManualCompanyEdit lookup: ${lookupErr.message}`);

  const now = new Date().toISOString();

  if (existing) {
    const patch: Record<string, unknown> = {
      source: "manual",
      updated_at: now,
    };
    if (employees !== null) patch.employees = employees;
    if (annual_revenue !== null) patch.annual_revenue = annual_revenue;
    if (industry !== null) patch.industry = industry;
    if (country !== null) patch.country = country;
    const { error } = await supabase
      .from("companies")
      .update(patch)
      .eq("id", (existing as { id: string }).id);
    if (error) throw new Error(`saveManualCompanyEdit update: ${error.message}`);
    return { name_normalized, inserted: false };
  }

  const insertRow = {
    apollo_account_id: `manual:${name_normalized}`,
    source: "manual",
    name: raw_name,
    name_normalized,
    country,
    employees,
    industry,
    annual_revenue,
    created_at: now,
    updated_at: now,
  };
  const { error } = await supabase.from("companies").insert(insertRow);
  if (error) throw new Error(`saveManualCompanyEdit insert: ${error.message}`);
  return { name_normalized, inserted: true };
}
