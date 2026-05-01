"use server";

import {
  listEvents as _listEvents,
  getEventExhibitors as _getEventExhibitors,
  getCrossEventExhibitors as _getCrossEventExhibitors,
  setCompanyTag as _setCompanyTag,
  type EventListItem,
  type LibraryExhibitor,
  type CrossEventCompany,
  type TagValue,
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
