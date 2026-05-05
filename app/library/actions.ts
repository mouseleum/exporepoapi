"use server";

import {
  listEvents as _listEvents,
  getEventExhibitors as _getEventExhibitors,
  getCrossEventExhibitors as _getCrossEventExhibitors,
  setCompanyTag as _setCompanyTag,
  saveEventWithExhibitors as _saveEventWithExhibitors,
  bulkSetCompanyTags as _bulkSetCompanyTags,
  listTaggedCompanies as _listTaggedCompanies,
  syncCompaniesToDb as _syncCompaniesToDb,
  type EventListItem,
  type LibraryExhibitor,
  type CrossEventCompany,
  type TagValue,
  type SaveEventInput,
  type SaveEventRow,
  type SaveEventResult,
  type BulkTagResult,
  type TaggedCompanyRow,
  type SyncCompanyInput,
  type SyncDbResult,
} from "@/lib/library/queries";

export async function listEvents(): Promise<EventListItem[]> {
  return _listEvents();
}

export async function getEventExhibitors(
  eventId: string,
): Promise<LibraryExhibitor[]> {
  return _getEventExhibitors(eventId);
}

export async function getCrossEventExhibitors(): Promise<CrossEventCompany[]> {
  return _getCrossEventExhibitors();
}

export async function setCompanyTag(
  name_normalized: string,
  tag: TagValue | null,
): Promise<void> {
  return _setCompanyTag(name_normalized, tag);
}

export async function saveEventFromCsv(
  meta: SaveEventInput,
  rows: SaveEventRow[],
): Promise<SaveEventResult> {
  return _saveEventWithExhibitors(meta, rows);
}

export async function bulkSetCompanyTags(
  names: string[],
  tag: TagValue,
): Promise<BulkTagResult> {
  return _bulkSetCompanyTags(names, tag);
}

export async function listTaggedCompanies(): Promise<TaggedCompanyRow[]> {
  return _listTaggedCompanies();
}

export async function syncCompaniesToDb(
  companies: SyncCompanyInput[],
  source: string,
): Promise<SyncDbResult> {
  return _syncCompaniesToDb(companies, source);
}
