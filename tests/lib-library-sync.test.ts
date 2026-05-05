import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { syncCompaniesToDb } from "../lib/library/queries";

type ExistingRow = {
  id: string;
  name_normalized: string;
  country: string | null;
  employees: number | null;
  industry: string | null;
};

type Updated = { id: string; patch: Record<string, unknown> };

function makeSupabase(existing: ExistingRow[]) {
  const inserts: unknown[][] = [];
  const updates: Updated[] = [];

  const builder = {
    select: vi.fn(() => ({
      in: vi.fn(async (_col: string, keys: string[]) => ({
        data: existing.filter((e) => keys.includes(e.name_normalized)),
        error: null,
      })),
    })),
    insert: vi.fn(async (rows: unknown[]) => {
      inserts.push(rows);
      return { error: null };
    }),
    update: vi.fn((patch: Record<string, unknown>) => ({
      eq: vi.fn(async (_col: string, id: string) => {
        updates.push({ id, patch });
        return { error: null };
      }),
    })),
  };

  const supabase = {
    from: vi.fn(() => builder),
  } as unknown as SupabaseClient;

  return { supabase, inserts, updates };
}

describe("syncCompaniesToDb", () => {
  it("returns zeros when input is empty", async () => {
    const { supabase } = makeSupabase([]);
    const r = await syncCompaniesToDb([], "csv", supabase);
    expect(r).toEqual({ added: 0, updated: 0, total: 0 });
  });

  it("inserts new rows with synthetic apollo_account_id", async () => {
    const { supabase, inserts } = makeSupabase([]);
    const r = await syncCompaniesToDb(
      [{ name: "Acme Corp", country: "US" }],
      "csv",
      supabase,
    );
    expect(r).toEqual({ added: 1, updated: 0, total: 1 });
    expect(inserts).toHaveLength(1);
    expect(inserts[0]?.[0]).toMatchObject({
      apollo_account_id: "csv:acmecorp",
      source: "csv",
      name: "Acme Corp",
      name_normalized: "acmecorp",
      country: "US",
    });
  });

  it("updates only missing fields on existing rows", async () => {
    const { supabase, inserts, updates } = makeSupabase([
      {
        id: "id-1",
        name_normalized: "acmecorp",
        country: "US",
        employees: null,
        industry: null,
      },
    ]);
    const r = await syncCompaniesToDb(
      [
        { name: "Acme Corp", country: "DE", employees: 100, industry: "tech" },
      ],
      "csv",
      supabase,
    );
    expect(r).toEqual({ added: 0, updated: 1, total: 1 });
    expect(inserts).toHaveLength(0);
    const patch = updates[0]?.patch ?? {};
    expect(patch.country).toBeUndefined();
    expect(patch.employees).toBe(100);
    expect(patch.industry).toBe("tech");
  });

  it("skips rows that have nothing new to fill", async () => {
    const { supabase, inserts, updates } = makeSupabase([
      {
        id: "id-1",
        name_normalized: "acmecorp",
        country: "US",
        employees: 50,
        industry: "tech",
      },
    ]);
    const r = await syncCompaniesToDb(
      [{ name: "Acme Corp", country: "DE" }],
      "csv",
      supabase,
    );
    expect(r).toEqual({ added: 0, updated: 0, total: 1 });
    expect(inserts).toHaveLength(0);
    expect(updates).toHaveLength(0);
  });

  it("dedupes by normalized name within a single call", async () => {
    const { supabase, inserts } = makeSupabase([]);
    const r = await syncCompaniesToDb(
      [
        { name: "Acme Corp" },
        { name: "ACME CORP!" },
        { name: "Other Inc" },
      ],
      "csv",
      supabase,
    );
    expect(r.total).toBe(2);
    expect(r.added).toBe(2);
    expect(inserts[0]).toHaveLength(2);
  });

  it("filters out rows with name length < 2", async () => {
    const { supabase, inserts } = makeSupabase([]);
    const r = await syncCompaniesToDb(
      [{ name: "X" }, { name: "  " }, { name: "Real Co" }],
      "csv",
      supabase,
    );
    expect(r.total).toBe(1);
    expect(inserts[0]).toHaveLength(1);
  });
});
