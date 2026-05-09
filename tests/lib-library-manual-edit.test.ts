import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  parseRevenueShorthand,
  saveManualCompanyEdit,
} from "../lib/library/manual-edit";

describe("parseRevenueShorthand", () => {
  it("parses M shorthand", () => {
    expect(parseRevenueShorthand("50M")).toBe(50_000_000);
    expect(parseRevenueShorthand("12m")).toBe(12_000_000);
    expect(parseRevenueShorthand("1.5M")).toBe(1_500_000);
  });

  it("parses B shorthand", () => {
    expect(parseRevenueShorthand("1.2B")).toBe(1_200_000_000);
    expect(parseRevenueShorthand("3b")).toBe(3_000_000_000);
  });

  it("parses K shorthand", () => {
    expect(parseRevenueShorthand("500K")).toBe(500_000);
  });

  it("parses raw integers", () => {
    expect(parseRevenueShorthand("500")).toBe(500);
    expect(parseRevenueShorthand("12000000")).toBe(12_000_000);
  });

  it("strips $ and commas", () => {
    expect(parseRevenueShorthand("$1,200,000")).toBe(1_200_000);
    expect(parseRevenueShorthand("$50M")).toBe(50_000_000);
  });

  it("returns null for empty / invalid", () => {
    expect(parseRevenueShorthand("")).toBeNull();
    expect(parseRevenueShorthand("   ")).toBeNull();
    expect(parseRevenueShorthand("abc")).toBeNull();
    expect(parseRevenueShorthand("12X")).toBeNull();
  });
});

type FakeRow = { id: string };

function makeSupabase(existing: FakeRow | null) {
  const updates: { id: string; patch: Record<string, unknown> }[] = [];
  const inserts: unknown[] = [];

  const supabase = {
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          maybeSingle: vi.fn(async () => ({ data: existing, error: null })),
        })),
      })),
      update: vi.fn((patch: Record<string, unknown>) => ({
        eq: vi.fn(async (_col: string, id: string) => {
          updates.push({ id, patch });
          return { error: null };
        }),
      })),
      insert: vi.fn(async (row: unknown) => {
        inserts.push(row);
        return { error: null };
      }),
    })),
  } as unknown as SupabaseClient;

  return { supabase, updates, inserts };
}

describe("saveManualCompanyEdit", () => {
  it("inserts when no row exists", async () => {
    const { supabase, inserts, updates } = makeSupabase(null);
    const r = await saveManualCompanyEdit(
      {
        raw_name: "Acme Corp",
        country: "US",
        employees: 85,
        annual_revenue: 12_000_000,
        industry: "Plastics",
      },
      supabase,
    );
    expect(r).toEqual({ name_normalized: "acmecorp", inserted: true });
    expect(updates).toHaveLength(0);
    expect(inserts).toHaveLength(1);
    expect(inserts[0]).toMatchObject({
      apollo_account_id: "manual:acmecorp",
      source: "manual",
      name: "Acme Corp",
      name_normalized: "acmecorp",
      country: "US",
      employees: 85,
      annual_revenue: 12_000_000,
      industry: "Plastics",
    });
  });

  it("updates only the fields provided when row exists", async () => {
    const { supabase, inserts, updates } = makeSupabase({ id: "id-1" });
    const r = await saveManualCompanyEdit(
      {
        raw_name: "Acme Corp",
        country: null,
        employees: 100,
        annual_revenue: null,
        industry: null,
      },
      supabase,
    );
    expect(r).toEqual({ name_normalized: "acmecorp", inserted: false });
    expect(inserts).toHaveLength(0);
    expect(updates).toHaveLength(1);
    const patch = updates[0]!.patch;
    expect(patch.source).toBe("manual");
    expect(patch.employees).toBe(100);
    expect(patch.annual_revenue).toBeUndefined();
    expect(patch.industry).toBeUndefined();
    expect(patch.country).toBeUndefined();
  });

  it("rejects empty / too-short names", async () => {
    const { supabase } = makeSupabase(null);
    await expect(
      saveManualCompanyEdit(
        {
          raw_name: "X",
          country: null,
          employees: null,
          annual_revenue: null,
          industry: null,
        },
        supabase,
      ),
    ).rejects.toThrow(/too short/);
  });
});
