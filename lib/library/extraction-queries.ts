import type { SupabaseClient } from "@supabase/supabase-js";
import { createServiceClient } from "../supabase";

export type ExtractionJobStatus =
  | "pending"
  | "claimed"
  | "done"
  | "failed"
  | "needs_review"
  | "rejected";

export type ExtractionJobView = {
  id: string;
  event_id: string;
  status: ExtractionJobStatus;
  worker_id: string | null;
  retry_count: number;
  error: string | null;
  summary: unknown;
  created_at: string;
  completed_at: string | null;
};

export async function insertExtractionJob(
  eventId: string,
  supabase: SupabaseClient = createServiceClient(),
): Promise<string> {
  if (!eventId) throw new Error("insertExtractionJob: eventId is required");
  const { data, error } = await supabase
    .from("extraction_jobs")
    .insert({ event_id: eventId, status: "pending" })
    .select("id")
    .single();
  if (error || !data) {
    throw new Error(`insertExtractionJob: ${error?.message ?? "no row returned"}`);
  }
  return data.id as string;
}

export async function getExtractionJob(
  jobId: string,
  supabase: SupabaseClient = createServiceClient(),
): Promise<ExtractionJobView | null> {
  const { data, error } = await supabase
    .from("extraction_jobs")
    .select("id, event_id, status, worker_id, retry_count, error, summary, created_at, completed_at")
    .eq("id", jobId)
    .maybeSingle();
  if (error) throw new Error(`getExtractionJob: ${error.message}`);
  if (!data) return null;
  return {
    id: data.id as string,
    event_id: data.event_id as string,
    status: data.status as ExtractionJobStatus,
    worker_id: (data.worker_id as string | null) ?? null,
    retry_count: data.retry_count as number,
    error: (data.error as string | null) ?? null,
    summary: data.summary,
    created_at: data.created_at as string,
    completed_at: (data.completed_at as string | null) ?? null,
  };
}

export type ExtractionCaptureView = {
  id: string;
  event_id: string;
  event_slug: string;
  event_name: string;
  source_url: string;
  request_url: string;
  request_method: string;
  response_path: string;
  field_map: unknown;
  pagination: unknown;
  discovered_by: string;
  confidence: number | null;
  promoted_at: string | null;
  notes: string | null;
  created_at: string;
};

export async function listExtractionCaptures(
  supabase: SupabaseClient = createServiceClient(),
): Promise<ExtractionCaptureView[]> {
  const { data, error } = await supabase
    .from("extraction_captures")
    .select(
      "id, event_id, source_url, request_url, request_method, response_path, field_map, pagination, discovered_by, confidence, promoted_at, notes, created_at, events!inner(slug, name)",
    )
    .order("created_at", { ascending: false });
  if (error) throw new Error(`listExtractionCaptures: ${error.message}`);
  if (!data) return [];
  return data.map((row) => {
    // Supabase JS returns the joined `events` rows as an array even for
    // !inner with a 1:1 FK; first element is the parent row.
    const rawEvents = (row as { events: { slug: string; name: string }[] | { slug: string; name: string } | null }).events;
    const e = Array.isArray(rawEvents) ? rawEvents[0] : rawEvents;
    return {
      id: row.id as string,
      event_id: row.event_id as string,
      event_slug: e?.slug ?? "",
      event_name: e?.name ?? "",
      source_url: row.source_url as string,
      request_url: row.request_url as string,
      request_method: row.request_method as string,
      response_path: row.response_path as string,
      field_map: row.field_map,
      pagination: row.pagination,
      discovered_by: row.discovered_by as string,
      confidence: (row.confidence as number | null) ?? null,
      promoted_at: (row.promoted_at as string | null) ?? null,
      notes: (row.notes as string | null) ?? null,
      created_at: row.created_at as string,
    };
  });
}

export async function updateCaptureNotes(
  captureId: string,
  notes: string,
  supabase: SupabaseClient = createServiceClient(),
): Promise<void> {
  const { error } = await supabase
    .from("extraction_captures")
    .update({ notes, updated_at: new Date().toISOString() })
    .eq("id", captureId);
  if (error) throw new Error(`updateCaptureNotes: ${error.message}`);
}

export async function togglePromoted(
  captureId: string,
  promote: boolean,
  supabase: SupabaseClient = createServiceClient(),
): Promise<void> {
  const { error } = await supabase
    .from("extraction_captures")
    .update({
      promoted_at: promote ? new Date().toISOString() : null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", captureId);
  if (error) throw new Error(`togglePromoted: ${error.message}`);
}
