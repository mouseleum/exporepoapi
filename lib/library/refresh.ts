import type { SupabaseClient } from "@supabase/supabase-js";
import type { Adapter } from "../adapters/types";
import { ADAPTERS } from "../adapters/registry";
import { loadEventForAdapter, type LoadEventResult } from "./load-event";

export type RefreshOutcome =
  | ({ status: "ok" } & LoadEventResult)
  | { status: "skipped"; slug: string; source: string; reason: string }
  | { status: "error"; slug: string; source: string; error: string };

export type RefreshSummary = {
  started_at: string;
  finished_at: string;
  elapsed_ms: number;
  ok: number;
  skipped: number;
  errors: number;
  results: RefreshOutcome[];
};

export type DbEvent = { slug: string; source: string };

export async function listRefreshableEvents(
  supabase: SupabaseClient,
): Promise<DbEvent[]> {
  const { data, error } = await supabase
    .from("events")
    .select("slug, source")
    .order("slug");
  if (error) {
    throw new Error(`events select failed: ${error.message}`);
  }
  return (data ?? []) as DbEvent[];
}

export async function refreshAllEvents(
  supabase: SupabaseClient,
  adapters: Record<string, Adapter> = ADAPTERS,
): Promise<RefreshSummary> {
  const start = Date.now();
  const startedAt = new Date(start).toISOString();
  const events = await listRefreshableEvents(supabase);

  const results: RefreshOutcome[] = [];
  let ok = 0;
  let skipped = 0;
  let errors = 0;

  for (const ev of events) {
    const adapter = adapters[ev.source];
    if (!adapter) {
      results.push({
        status: "skipped",
        slug: ev.slug,
        source: ev.source,
        reason: "no adapter registered for source",
      });
      skipped++;
      continue;
    }
    try {
      const r = await loadEventForAdapter(adapter, supabase);
      results.push({ status: "ok", ...r });
      ok++;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      results.push({
        status: "error",
        slug: ev.slug,
        source: ev.source,
        error: msg,
      });
      errors++;
    }
  }

  const finish = Date.now();
  return {
    started_at: startedAt,
    finished_at: new Date(finish).toISOString(),
    elapsed_ms: finish - start,
    ok,
    skipped,
    errors,
    results,
  };
}
