import type { SupabaseClient } from "@supabase/supabase-js";
import type { AdapterFactory } from "../adapters/types";
import { ADAPTER_FACTORIES } from "../adapters/registry";
import {
  loadEventForRow,
  type EventRow,
  type LoadEventResult,
} from "./load-event";

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

export async function listRefreshableEvents(
  supabase: SupabaseClient,
): Promise<EventRow[]> {
  const { data, error } = await supabase
    .from("events")
    .select("source, slug, name, year, source_url, adapter_config")
    .order("slug");
  if (error) {
    throw new Error(`events select failed: ${error.message}`);
  }
  return (data ?? []) as EventRow[];
}

export async function refreshAllEvents(
  supabase: SupabaseClient,
  factories: Record<string, AdapterFactory> = ADAPTER_FACTORIES,
): Promise<RefreshSummary> {
  const start = Date.now();
  const startedAt = new Date(start).toISOString();
  const events = await listRefreshableEvents(supabase);

  const results: RefreshOutcome[] = [];
  let ok = 0;
  let skipped = 0;
  let errors = 0;

  for (const ev of events) {
    if (!factories[ev.source]) {
      results.push({
        status: "skipped",
        slug: ev.slug,
        source: ev.source,
        reason: "no adapter family registered",
      });
      skipped++;
      continue;
    }
    try {
      const r = await loadEventForRow(ev, supabase, factories);
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
