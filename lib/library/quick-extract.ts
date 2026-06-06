import type { SupabaseClient } from "@supabase/supabase-js";
import { createServiceClient } from "../supabase";
import { insertExtractionJob } from "./extraction-queries";

export type QuickExtractResult = {
  event_id: string;
  job_id: string;
  slug: string;
  reused_event: boolean;
};

function safeUrl(raw: string): URL | null {
  try {
    const u = new URL(raw.trim());
    if (u.protocol !== "http:" && u.protocol !== "https:") return null;
    return u;
  } catch {
    return null;
  }
}

function yearFromUrl(u: URL): number | null {
  const candidates = [u.pathname, u.host, u.search].map((s) => {
    try {
      return decodeURIComponent(s);
    } catch {
      return s;
    }
  });
  for (const c of candidates) {
    const m = c.match(/(?<!\d)((?:19|20)\d{2})(?!\d)/);
    if (m && m[1]) {
      const n = Number(m[1]);
      if (Number.isInteger(n)) return n;
    }
  }
  return null;
}

function titleCase(s: string): string {
  return s
    .split(/\s+/)
    .map((w) => (w ? w[0]!.toUpperCase() + w.slice(1) : w))
    .join(" ");
}

function deriveName(u: URL, year: number | null): string {
  const host = u.host.replace(/^www\./i, "");
  const main = (host.split(".")[0] ?? host).replace(/[-_]+/g, " ").trim();
  const titled = titleCase(main || host);
  return year ? `${titled} ${year}` : titled;
}

function deriveBaseSlug(u: URL, year: number | null): string {
  const host = u.host
    .replace(/^www\./i, "")
    .replace(/[^a-z0-9]+/gi, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase();
  return year ? `${host}-${year}` : host;
}

/**
 * One-shot "paste URL → extract" handler.
 *
 * - Validates the URL.
 * - Reuses an existing event with the same source_url (so re-pasting the same
 *   URL queues another job against the same event rather than duplicating).
 * - Otherwise creates a new event row with source='extract-agent' (a sentinel
 *   meaning "no coded adapter — the agent owns this"). lib/library/refresh.ts
 *   already skips events whose source isn't in ADAPTER_FACTORIES, so cron is
 *   safe.
 * - Inserts an extraction_jobs row so a running agent claims it on next tick.
 *
 * Returns the job id so the UI can poll for status, plus the slug + a flag
 * indicating whether the event was reused or freshly created.
 */
export async function quickExtract(
  rawUrl: string,
  supabase: SupabaseClient = createServiceClient(),
): Promise<QuickExtractResult> {
  const u = safeUrl(rawUrl);
  if (!u) throw new Error("Invalid URL — must be http or https");
  const normalizedUrl = u.toString();

  const { data: existing, error: existingErr } = await supabase
    .from("events")
    .select("id, slug")
    .eq("source_url", normalizedUrl)
    .limit(1);
  if (existingErr) throw new Error(`event lookup: ${existingErr.message}`);
  if (existing && existing[0]) {
    const eventId = existing[0].id as string;
    const slug = existing[0].slug as string;
    const jobId = await insertExtractionJob(eventId, supabase);
    return { event_id: eventId, job_id: jobId, slug, reused_event: true };
  }

  const year = yearFromUrl(u);
  const baseSlug = deriveBaseSlug(u, year);

  // Slug uniqueness: events.slug is unique. If our derived slug collides with
  // an unrelated event, append -2, -3, …
  let slug = baseSlug;
  for (let i = 2; i < 100; i++) {
    const { data: clash, error: clashErr } = await supabase
      .from("events")
      .select("id")
      .eq("slug", slug)
      .limit(1);
    if (clashErr) throw new Error(`slug check: ${clashErr.message}`);
    if (!clash || clash.length === 0) break;
    slug = `${baseSlug}-${i}`;
  }

  const { data: created, error: createErr } = await supabase
    .from("events")
    .insert({
      source: "extract-agent",
      slug,
      name: deriveName(u, year),
      year,
      source_url: normalizedUrl,
      adapter_config: {},
      romify_attending: false,
    })
    .select("id")
    .single();
  if (createErr || !created) {
    throw new Error(`create event: ${createErr?.message ?? "no row returned"}`);
  }
  const eventId = created.id as string;
  const jobId = await insertExtractionJob(eventId, supabase);
  return { event_id: eventId, job_id: jobId, slug, reused_event: false };
}
