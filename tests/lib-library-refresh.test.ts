import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Adapter } from "../lib/adapters/types";
import { refreshAllEvents } from "../lib/library/refresh";

function makeAdapter(
  source: string,
  slug: string,
  fetchImpl: () => Promise<Adapter["meta"] extends infer _ ? unknown : never>,
): Adapter {
  return {
    meta: {
      source,
      slug,
      name: slug,
      year: 2026,
      source_url: `https://${source}.example/`,
    },
    fetch: fetchImpl as Adapter["fetch"],
  };
}

type DbEvent = { slug: string; source: string };

function makeSupabase(events: DbEvent[]) {
  const calls: Array<{ table: string; op: string; payload?: unknown }> = [];

  const eventsTable = {
    select: vi.fn(() => ({
      order: vi.fn(async () => ({ data: events, error: null })),
    })),
    upsert: vi.fn((row: unknown) => {
      calls.push({ table: "events", op: "upsert", payload: row });
      return {
        select: () => ({
          single: async () => ({
            data: { id: `event-id-for-${(row as { slug: string }).slug}` },
            error: null,
          }),
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

  return { supabase, calls, eventsTable, eeTable };
}

describe("refreshAllEvents", () => {
  it("returns ok=0 skipped=0 errors=0 when there are no events", async () => {
    const { supabase } = makeSupabase([]);
    const summary = await refreshAllEvents(supabase, {});
    expect(summary).toMatchObject({ ok: 0, skipped: 0, errors: 0 });
    expect(summary.results).toEqual([]);
  });

  it("skips events whose source has no registered adapter", async () => {
    const { supabase } = makeSupabase([
      { slug: "ghost-2026", source: "ghost" },
    ]);
    const summary = await refreshAllEvents(supabase, {});
    expect(summary.ok).toBe(0);
    expect(summary.skipped).toBe(1);
    expect(summary.results[0]).toMatchObject({
      status: "skipped",
      slug: "ghost-2026",
      source: "ghost",
    });
  });

  it("calls the matching adapter and counts ok", async () => {
    const fetchSpy = vi.fn(async () => [
      { raw_name: "Acme", country: "DE", hall: null, booth: null },
      { raw_name: "Beta", country: "FR", hall: null, booth: null },
    ]);
    const adapter = makeAdapter("interpack", "interpack-2026", fetchSpy);
    const { supabase } = makeSupabase([
      { slug: "interpack-2026", source: "interpack" },
    ]);
    const summary = await refreshAllEvents(supabase, { interpack: adapter });
    expect(fetchSpy).toHaveBeenCalledOnce();
    expect(summary.ok).toBe(1);
    expect(summary.errors).toBe(0);
    expect(summary.results[0]).toMatchObject({
      status: "ok",
      slug: "interpack-2026",
      upserted: 2,
      dupes: 0,
    });
  });

  it("captures adapter errors without aborting other refreshes", async () => {
    const okAdapter = makeAdapter(
      "good",
      "good-2026",
      vi.fn(async () => [
        { raw_name: "Acme", country: null, hall: null, booth: null },
      ]),
    );
    const failAdapter = makeAdapter(
      "bad",
      "bad-2026",
      vi.fn(async () => {
        throw new Error("network down");
      }),
    );
    const { supabase } = makeSupabase([
      { slug: "bad-2026", source: "bad" },
      { slug: "good-2026", source: "good" },
    ]);
    const summary = await refreshAllEvents(supabase, {
      good: okAdapter,
      bad: failAdapter,
    });
    expect(summary.ok).toBe(1);
    expect(summary.errors).toBe(1);
    const err = summary.results.find((r) => r.status === "error");
    expect(err).toMatchObject({
      status: "error",
      slug: "bad-2026",
      error: "network down",
    });
  });

  it("includes timing info in the summary", async () => {
    const { supabase } = makeSupabase([]);
    const summary = await refreshAllEvents(supabase, {});
    expect(typeof summary.started_at).toBe("string");
    expect(typeof summary.finished_at).toBe("string");
    expect(summary.elapsed_ms).toBeGreaterThanOrEqual(0);
  });
});
