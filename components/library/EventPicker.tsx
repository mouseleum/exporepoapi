"use client";

import type { EventListItem } from "@/lib/library/queries";

type EventPickerProps = {
  events: EventListItem[];
  selectedId: string | null;
  onChange: (id: string) => void;
  showAll: boolean;
  onShowAllChange: (showAll: boolean) => void;
};

function formatScrapedDate(iso: string | null): string {
  if (!iso) return "never scraped";
  return `scraped ${iso.slice(0, 10)}`;
}

export function EventPicker({
  events,
  selectedId,
  onChange,
  showAll,
  onShowAllChange,
}: EventPickerProps) {
  const visibleEvents = showAll
    ? events
    : events.filter((e) => e.romify_attending);
  const selected = visibleEvents.find((e) => e.id === selectedId) ?? null;
  const hiddenCount = events.length - visibleEvents.length;
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
          {visibleEvents.map((e) => (
            <option key={e.id} value={e.id}>
              {e.name}
              {e.year ? ` ${e.year}` : ""} · {e.exhibitor_count} exhibitors
            </option>
          ))}
        </select>
        <label className="event-picker-toggle">
          <input
            type="checkbox"
            checked={showAll}
            onChange={(e) => onShowAllChange(e.target.checked)}
          />
          <span>
            Show all events
            {hiddenCount > 0 && !showAll ? ` (${hiddenCount} hidden)` : ""}
          </span>
        </label>
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
