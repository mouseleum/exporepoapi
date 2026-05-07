import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Adapter, AdapterFactory } from "../lib/adapters/types";
import { refreshAllEvents } from "../lib/library/refresh";

type DbEvent = {
  source: string;
  slug: string;
  name: string;
  year: number | null;
  source_url: string | null;
  adapter_config: unknown;
};

function makeFactory(fetchImpl: () => Promise<Adapter["fetch"] extends () => Promise<infer T> ? T : never>): AdapterFactory {
  return (meta, _config) => ({
    meta,
    fetch: fetchImpl as Adapter["fetch"],
  });
}

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

function ev(partial: Partial<DbEvent> & Pick<DbEvent, "source" | "slug">): DbEvent {
  return {
    name: partial.slug,
    year: 2026,
    source_url: `https://${partial.source}.example/`,
    adapter_config: {},
    ...partial,
  };
}

describe("refreshAllEvents", () => {
  it("returns ok=0 skipped=0 errors=0 when there are no events", async () => {
    const { supabase } = makeSupabase([]);
    const summary = await refreshAllEvents(supabase, {});
    expect(summary).toMatchObject({ ok: 0, skipped: 0, errors: 0 });
    expect(summary.results).toEqual([]);
  });

  it("skips events whose source has no registered adapter family", async () => {
    const { supabase } = makeSupabase([ev({ slug: "ghost-2026", source: "ghost" })]);
    const summary = await refreshAllEvents(supabase, {});
    expect(summary.ok).toBe(0);
    expect(summary.skipped).toBe(1);
    expect(summary.results[0]).toMatchObject({
      status: "skipped",
      slug: "ghost-2026",
      source: "ghost",
      reason: "no adapter family registered",
    });
  });

  it("calls the matching factory and counts ok", async () => {
    const fetchSpy = vi.fn(async () => [
      { raw_name: "Acme", country: "DE", hall: null, booth: null },
      { raw_name: "Beta", country: "FR", hall: null, booth: null },
    ]);
    const factory = makeFactory(fetchSpy);
    const { supabase } = makeSupabase([
      ev({ slug: "interpack-2026", source: "dimedis" }),
    ]);
    const summary = await refreshAllEvents(supabase, { dimedis: factory });
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

  it("captures factory errors without aborting other refreshes", async () => {
    const okFactory = makeFactory(vi.fn(async () => [
      { raw_name: "Acme", country: null, hall: null, booth: null },
    ]));
    const failFactory = makeFactory(vi.fn(async () => {
      throw new Error("network down");
    }));
    const { supabase } = makeSupabase([
      ev({ slug: "bad-2026", source: "bad" }),
      ev({ slug: "good-2026", source: "good" }),
    ]);
    const summary = await refreshAllEvents(supabase, {
      good: okFactory,
      bad: failFactory,
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

  it("passes adapter_config through to the factory", async () => {
    const factorySpy = vi.fn((meta, _config) => ({
      meta,
      fetch: async () => [{ raw_name: "X", country: null, hall: null, booth: null }],
    }));
    const { supabase } = makeSupabase([
      {
        ...ev({ slug: "x-2026", source: "dimedis" }),
        adapter_config: { domain: "x.example.com", minExhibitors: 1 },
      },
    ]);
    await refreshAllEvents(supabase, { dimedis: factorySpy });
    expect(factorySpy).toHaveBeenCalledWith(
      expect.objectContaining({ slug: "x-2026", source: "dimedis" }),
      { domain: "x.example.com", minExhibitors: 1 },
    );
  });
});
