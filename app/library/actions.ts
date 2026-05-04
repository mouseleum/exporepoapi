"use server";

import {
  listEvents as _listEvents,
  getEventExhibitors as _getEventExhibitors,
  getCrossEventExhibitors as _getCrossEventExhibitors,
  setCompanyTag as _setCompanyTag,
  saveEventWithExhibitors as _saveEventWithExhibitors,
  type EventListItem,
  type LibraryExhibitor,
  type CrossEventCompany,
  type TagValue,
  type SaveEventInput,
  type SaveEventRow,
  type SaveEventResult,
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
