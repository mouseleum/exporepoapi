"use server";

import {
  listAllAdminEvents as _listAllAdminEvents,
  updateEvent as _updateEvent,
  deleteEvent as _deleteEvent,
  type AdminEventRow,
  type UpdateEventPatch,
} from "@/lib/library/admin-queries";
import {
  importEventCsv as _importEventCsv,
  type ImportEventCsvInput,
  type ImportEventCsvResult,
} from "@/lib/library/import-csv";

export async function listAllAdminEvents(): Promise<AdminEventRow[]> {
  return _listAllAdminEvents();
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

export async function importEventCsv(
  input: ImportEventCsvInput,
): Promise<ImportEventCsvResult> {
  return _importEventCsv(input);
}
