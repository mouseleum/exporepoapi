"use client";

import type { EventListItem } from "@/lib/library/queries";

type EventPickerProps = {
  events: EventListItem[];
  selectedId: string | null;
  onChange: (id: string) => void;
};

function formatScrapedDate(iso: string | null): string {
  if (!iso) return "never scraped";
  return `scraped ${iso.slice(0, 10)}`;
}

export function EventPicker({
  events,
  selectedId,
  onChange,
}: EventPickerProps) {
  const selected = events.find((e) => e.id === selectedId) ?? null;
  return (
    <div className="event-picker">
      <div className="event-picker-row">
        <label htmlFor="event-select" className="event-picker-label">
          Event
        </label>
        <select
          id="event-select"
          value={selectedId ?? ""}
          onChange={(e) => onChange(e.target.value)}
          className="event-picker-select"
        >
          <option value="" disabled>
            Pick an event…
          </option>
          {events.map((e) => (
            <option key={e.id} value={e.id}>
              {e.name}
              {e.year ? ` ${e.year}` : ""} · {e.exhibitor_count} exhibitors
            </option>
          ))}
        </select>
      </div>
      {selected && (
        <div className="event-picker-meta">
          {selected.exhibitor_count} exhibitors ·{" "}
          {formatScrapedDate(selected.scraped_at)}
        </div>
      )}
    </div>
  );
}
