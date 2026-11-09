import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { ingestExhibitors } from "../lib/library/ingest-exhibitors";
import { importEventCsv, CSV_SOURCE } from "../lib/library/import-csv";

// Mirrors the mock shape in lib-library-refresh.test.ts, plus the slug lookup
// that import-csv does before writing.
function makeSupabase(existing: { source: string } | null = null) {
  const calls: Array<{ table: string; op: string; payload?: unknown }> = [];

  const eventsTable = {
    select: vi.fn(() => ({
      eq: vi.fn(() => ({
        maybeSingle: async () => ({ data: existing, error: null }),
      })),
    })),
    upsert: vi.fn((row: unknown) => {
      calls.push({ table: "events", op: "upsert", payload: row });
      return {
        select: () => ({
          single: async () => ({ data: { id: "event-1" }, error: null }),
        }),
      };
    }),
  };

  const eeTable = {
    upsert: vi.fn(async (rows: unknown) => {
      calls.push({ table: "event_exhibitors", op: "upsert", payload: rows });
      return { error: null };
    }),
  };

  const supabase = {
    from: vi.fn((table: string) => {
      if (table === "events") return eventsTable;
      if (table === "event_exhibitors") return eeTable;
      throw new Error(`unexpected table: ${table}`);
    }),
  } as unknown as SupabaseClient;

  return { supabase, calls };
}

const CSV = "Company,Country,Booth\nAcme GmbH,Germany,A-12\nBeta SA,France,B-3";

describe("ingestExhibitors", () => {
  it("dedupes on the normalized name and reports how many it merged", async () => {
    const { supabase, calls } = makeSupabase();
    const result = await ingestExhibitors(
      { source: "csv", slug: "x-2026", name: "X", year: 2026, source_url: null },
      [
        { raw_name: "Acme, Inc." },
        { raw_name: "ACME INC" }, // same normalized key
        { raw_name: "Beta" },
      ],
      supabase,
    );
    expect(result.fetched).toBe(3);
    expect(result.upserted).toBe(2);
    expect(result.dupes).toBe(1);
    const written = calls.find((c) => c.table === "event_exhibitors")
      ?.payload as Array<{ raw_name: string }>;
    expect(written.map((r) => r.raw_name)).toEqual(["Acme, Inc.", "Beta"]);
  });

  it("stamps every row with the event id it upserted", async () => {
    const { supabase, calls } = makeSupabase();
    await ingestExhibitors(
      { source: "csv", slug: "x", name: "X", year: null, source_url: null },
      [{ raw_name: "Acme" }],
      supabase,
    );
    const written = calls.find((c) => c.table === "event_exhibitors")
      ?.payload as Array<{ event_id: string }>;
    expect(written[0]?.event_id).toBe("event-1");
  });

  it("collects source_ids only for rows that carry one", async () => {
    const { supabase } = makeSupabase();
    const result = await ingestExhibitors(
      { source: "swapcard", slug: "x", name: "X", year: null, source_url: null },
      [{ raw_name: "Acme", source_id: "s1" }, { raw_name: "Beta" }],
      supabase,
    );
    expect(result.source_ids).toEqual(["s1"]);
  });
});

describe("importEventCsv", () => {
  it("imports a CSV under the csv source sentinel", async () => {
    const { supabase, calls } = makeSupabase();
    const result = await importEventCsv(
      { slug: "drupa-2028", name: "drupa 2028", year: 2028, csvText: CSV },
      supabase,
    );
    expect(result.imported).toBe(2);
    expect(result.slug).toBe("drupa-2028");
    expect(result.columns.booth).toBe("Booth");
    const ev = calls.find((c) => c.table === "events")?.payload as {
      source: string;
    };
    expect(ev.source).toBe(CSV_SOURCE);
  });

  it("refuses to import over an adapter-sourced event", async () => {
    // Upserting on slug would rewrite source to "csv" and silently drop the
    // show out of the refresh cron.
    const { supabase, calls } = makeSupabase({ source: "swapcard" });
    await expect(
      importEventCsv(
        { slug: "vitafoods-2026", name: "Vitafoods", year: 2026, csvText: CSV },
        supabase,
      ),
    ).rejects.toThrow(/already exists as a swapcard event/);
    expect(calls).toHaveLength(0); // nothing written
  });

  it("allows re-importing over an existing csv event", async () => {
    const { supabase } = makeSupabase({ source: CSV_SOURCE });
    const result = await importEventCsv(
      { slug: "drupa-2028", name: "drupa 2028", year: 2028, csvText: CSV },
      supabase,
    );
    expect(result.imported).toBe(2);
  });

  it("rejects an empty CSV, a missing slug and a missing name", async () => {
    const { supabase } = makeSupabase();
    const base = { slug: "s", name: "N", year: null, csvText: CSV };
    await expect(
      importEventCsv({ ...base, csvText: "   " }, supabase),
    ).rejects.toThrow(/CSV is empty/);
    await expect(
      importEventCsv({ ...base, slug: "  " }, supabase),
    ).rejects.toThrow(/slug is required/);
    await expect(
      importEventCsv({ ...base, name: "  " }, supabase),
    ).rejects.toThrow(/name is required/);
  });

  it("rejects a CSV whose rows all lack a name", async () => {
    const { supabase } = makeSupabase();
    await expect(
      importEventCsv(
        { slug: "s", name: "N", year: null, csvText: "Company,Country\n,DE\n,FR" },
        supabase,
      ),
    ).rejects.toThrow(/no exhibitors found/);
  });

  it("normalizes a blank source_url to null", async () => {
    const { supabase, calls } = makeSupabase();
    await importEventCsv(
      { slug: "s", name: "N", year: null, source_url: "   ", csvText: CSV },
      supabase,
    );
    const ev = calls.find((c) => c.table === "events")?.payload as {
      source_url: string | null;
    };
    expect(ev.source_url).toBeNull();
  });
});
