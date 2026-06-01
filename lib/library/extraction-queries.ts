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
