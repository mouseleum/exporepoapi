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
