import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  deleteEvent,
  listAllAdminEvents,
  updateEvent,
} from "../lib/library/admin-queries";

type DbEvent = {
  id: string;
  source: string;
  slug: string;
  name: string;
  year: number | null;
  source_url: string | null;
  adapter_config: unknown;
  romify_attending: boolean;
  scraped_at: string | null;
};

function makeListSupabase(
  events: DbEvent[],
  counts: Record<string, number> = {},
  peopleCounts: Record<string, number> = {},
) {
  const eventsTable = {
    select: vi.fn(() => ({
      order: vi.fn(() => ({
        order: vi.fn(async () => ({ data: events, error: null })),
      })),
    })),
  };
  const eeTable = {
    select: vi.fn(() => ({
      eq: vi.fn(async (_col: string, eventId: string) => ({
        count: counts[eventId] ?? 0,
        error: null,
      })),
    })),
  };
  const peopleTable = {
    select: vi.fn(() => ({
      eq: vi.fn(async (_col: string, eventId: string) => ({
        count: peopleCounts[eventId] ?? 0,
        error: null,
      })),
    })),
  };
  return {
    from: vi.fn((table: string) => {
      if (table === "events") return eventsTable;
      if (table === "event_exhibitors") return eeTable;
      if (table === "event_exhibitor_people") return peopleTable;
      throw new Error(`unexpected table: ${table}`);
    }),
  } as unknown as SupabaseClient;
}

describe("listAllAdminEvents", () => {
  it("returns [] when there are no events", async () => {
    const supabase = makeListSupabase([]);
    expect(await listAllAdminEvents(supabase)).toEqual([]);
  });

  it("returns admin rows with exhibitor counts and curation flag", async () => {
    const supabase = makeListSupabase(
      [
        {
          id: "e1",
          source: "dimedis",
          slug: "interpack-2026",
          name: "interpack 2026",
          year: 2026,
          source_url: "https://www.interpack.com/",
          adapter_config: { domain: "www.interpack.com", minExhibitors: 1000 },
          romify_attending: true,
          scraped_at: "2026-05-01T00:00:00Z",
        },
      ],
      { e1: 2901 },
      { e1: 174 },
    );
    const out = await listAllAdminEvents(supabase);
    expect(out).toEqual([
      {
        id: "e1",
        source: "dimedis",
        slug: "interpack-2026",
        name: "interpack 2026",
        year: 2026,
        source_url: "https://www.interpack.com/",
        adapter_config: { domain: "www.interpack.com", minExhibitors: 1000 },
        romify_attending: true,
        scraped_at: "2026-05-01T00:00:00Z",
        exhibitor_count: 2901,
        people_count: 174,
      },
    ]);
  });
});


describe("updateEvent", () => {
  function makeUpdateSupabase(error: { message: string } | null = null) {
    const update = vi.fn((patch: unknown) => ({
      eq: vi.fn(async (_col: string, _id: string) => ({ error, patch })),
    }));
    const supabase = {
      from: vi.fn((table: string) => {
        if (table !== "events") throw new Error(`unexpected table: ${table}`);
        return { update };
      }),
    } as unknown as SupabaseClient;
    return { supabase, update };
  }

  it("calls supabase.update with the patch", async () => {
    const { supabase, update } = makeUpdateSupabase();
    await updateEvent("e1", { romify_attending: false }, supabase);
    expect(update).toHaveBeenCalledWith({ romify_attending: false });
  });

  it("is a no-op when the patch is empty", async () => {
    const { supabase, update } = makeUpdateSupabase();
    await updateEvent("e1", {}, supabase);
    expect(update).not.toHaveBeenCalled();
  });

  it("rejects empty id", async () => {
    const { supabase } = makeUpdateSupabase();
    await expect(updateEvent("", { name: "n" }, supabase)).rejects.toThrow(
      /id is required/,
    );
  });

  it("propagates supabase errors", async () => {
    const { supabase } = makeUpdateSupabase({ message: "RLS denied" });
    await expect(
      updateEvent("e1", { name: "n" }, supabase),
    ).rejects.toThrow(/updateEvent: RLS denied/);
  });
});

describe("deleteEvent", () => {
  it("calls supabase.delete with the id", async () => {
    const eq = vi.fn(async (_col: string, _id: string) => ({ error: null }));
    const del = vi.fn(() => ({ eq }));
    const supabase = {
      from: vi.fn((table: string) => {
        if (table !== "events") throw new Error(`unexpected table: ${table}`);
        return { delete: del };
      }),
    } as unknown as SupabaseClient;
    await deleteEvent("e1", supabase);
    expect(del).toHaveBeenCalled();
    expect(eq).toHaveBeenCalledWith("id", "e1");
  });

  it("rejects empty id", async () => {
    const supabase = {
      from: vi.fn(() => {
        throw new Error("should not be called");
      }),
    } as unknown as SupabaseClient;
    await expect(deleteEvent("", supabase)).rejects.toThrow(/id is required/);
  });
});
