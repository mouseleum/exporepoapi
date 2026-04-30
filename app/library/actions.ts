"use server";

import {
  listEvents as _listEvents,
  getEventExhibitors as _getEventExhibitors,
  type EventListItem,
  type LibraryExhibitor,
} from "@/lib/library/queries";

export async function listEvents(): Promise<EventListItem[]> {
  return _listEvents();
}

export async function getEventExhibitors(
  eventId: string,
): Promise<LibraryExhibitor[]> {
  return _getEventExhibitors(eventId);
}
