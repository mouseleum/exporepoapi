import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  createEvent,
  deleteEvent,
  listAllAdminEvents,
  triggerEventFetch,
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

function makeListSupabase(events: DbEvent[], counts: Record<string, number> = {}) {
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
  return {
    from: vi.fn((table: string) => {
      if (table === "events") return eventsTable;
      if (table === "event_exhibitors") return eeTable;
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
      },
    ]);
  });
});

describe("createEvent", () => {
  function makeInsertSupabase(insertImpl: (row: unknown) => {
    data: unknown;
    error: { message: string } | null;
  }) {
    return {
      from: vi.fn((table: string) => {
        if (table !== "events") throw new Error(`unexpected table: ${table}`);
        return {
          insert: vi.fn((row: unknown) => ({
            select: () => ({
              single: async () => insertImpl(row),
            }),
          })),
        };
      }),
    } as unknown as SupabaseClient;
  }

  it("inserts the event and returns its id", async () => {
    let captured: unknown = null;
    const supabase = makeInsertSupabase((row) => {
      captured = row;
      return { data: { id: "new-id" }, error: null };
    });
    const out = await createEvent(
      {
        source: "dimedis",
        slug: "x-2026",
        name: "X 2026",
        year: 2026,
        source_url: "https://x.example/",
        adapter_config: { domain: "x.example" },
        romify_attending: true,
      },
      supabase,
    );
    expect(out).toEqual({ id: "new-id" });
    expect(captured).toMatchObject({
      source: "dimedis",
      slug: "x-2026",
      adapter_config: { domain: "x.example" },
      romify_attending: true,
    });
  });

  it("rejects empty slug or source", async () => {
    const supabase = makeInsertSupabase(() => ({
      data: { id: "x" },
      error: null,
    }));
    await expect(
      createEvent(
        {
          source: "dimedis",
          slug: "",
          name: "n",
          year: null,
          source_url: null,
          adapter_config: {},
          romify_attending: false,
        },
        supabase,
      ),
    ).rejects.toThrow(/slug is required/);
    await expect(
      createEvent(
        {
          source: "",
          slug: "x",
          name: "n",
          year: null,
          source_url: null,
          adapter_config: {},
          romify_attending: false,
        },
        supabase,
      ),
    ).rejects.toThrow(/source is required/);
  });

  it("propagates supabase errors", async () => {
    const supabase = makeInsertSupabase(() => ({
      data: null,
      error: { message: "duplicate slug" },
    }));
    await expect(
      createEvent(
        {
          source: "dimedis",
          slug: "x-2026",
          name: "X",
          year: 2026,
          source_url: null,
          adapter_config: {},
          romify_attending: false,
        },
        supabase,
      ),
    ).rejects.toThrow(/createEvent: duplicate slug/);
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

describe("triggerEventFetch", () => {
  it("rejects when the row's source family is not registered", async () => {
    const supabase = {
      from: vi.fn(() => ({
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            single: async () => ({
              data: {
                source: "ghost",
                slug: "ghost-2026",
                name: "g",
                year: 2026,
                source_url: null,
                adapter_config: {},
              },
              error: null,
            }),
          })),
        })),
      })),
    } as unknown as SupabaseClient;
    await expect(triggerEventFetch("e1", supabase)).rejects.toThrow(
      /no adapter family registered for source 'ghost'/,
    );
  });

  it("propagates lookup errors", async () => {
    const supabase = {
      from: vi.fn(() => ({
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            single: async () => ({
              data: null,
              error: { message: "row not found" },
            }),
          })),
        })),
      })),
    } as unknown as SupabaseClient;
    await expect(triggerEventFetch("missing", supabase)).rejects.toThrow(
      /row not found/,
    );
  });
});
