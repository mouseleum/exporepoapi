"use server";

import {
  listAllAdminEvents as _listAllAdminEvents,
  createEvent as _createEvent,
  updateEvent as _updateEvent,
  deleteEvent as _deleteEvent,
  triggerEventFetch as _triggerEventFetch,
  type AdminEventRow,
  type CreateEventInput,
  type UpdateEventPatch,
} from "@/lib/library/admin-queries";
import type { LoadEventResult } from "@/lib/library/load-event";
import {
  inferEventFromUrl as _inferEventFromUrl,
  type InferredEvent,
} from "@/lib/library/infer-event-from-url";
import {
  insertExtractionJob as _insertExtractionJob,
  getExtractionJob as _getExtractionJob,
  listExtractionJobs as _listExtractionJobs,
  listExtractionCaptures as _listExtractionCaptures,
  updateCaptureNotes as _updateCaptureNotes,
  togglePromoted as _togglePromoted,
  type ExtractionJobView,
  type ExtractionJobListRow,
  type ExtractionCaptureView,
} from "@/lib/library/extraction-queries";
import {
  quickExtract as _quickExtract,
  type QuickExtractResult,
} from "@/lib/library/quick-extract";

export async function listAllAdminEvents(): Promise<AdminEventRow[]> {
  return _listAllAdminEvents();
}

export async function createEvent(
  input: CreateEventInput,
): Promise<{ id: string }> {
  return _createEvent(input);
}

export async function updateEvent(
  id: string,
  patch: UpdateEventPatch,
): Promise<void> {
  return _updateEvent(id, patch);
}

export async function deleteEvent(id: string): Promise<void> {
  return _deleteEvent(id);
}

export async function triggerEventFetch(
  id: string,
): Promise<LoadEventResult> {
  return _triggerEventFetch(id);
}

export async function inferEventFromUrl(
  url: string,
): Promise<InferredEvent | null> {
  return _inferEventFromUrl(url);
}

export async function queueExtractionViaAgent(eventId: string): Promise<string> {
  return _insertExtractionJob(eventId);
}

export async function quickExtract(url: string): Promise<QuickExtractResult> {
  return _quickExtract(url);
}

export async function getExtractionJobStatus(
  jobId: string,
): Promise<ExtractionJobView | null> {
  return _getExtractionJob(jobId);
}

export async function listJobs(): Promise<ExtractionJobListRow[]> {
  return _listExtractionJobs();
}

export async function listCaptures(): Promise<ExtractionCaptureView[]> {
  return _listExtractionCaptures();
}

export async function updateCaptureNotes(captureId: string, notes: string): Promise<void> {
  return _updateCaptureNotes(captureId, notes);
}

export async function togglePromoted(captureId: string, promote: boolean): Promise<void> {
  return _togglePromoted(captureId, promote);
}
