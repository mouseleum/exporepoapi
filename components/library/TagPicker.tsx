"use client";

import { TAG_VALUES, type TagValue } from "@/lib/library/queries";

type TagPickerProps = {
  value: TagValue | null;
  onChange: (tag: TagValue | null) => void;
  disabled?: boolean;
};

export function TagPicker({ value, onChange, disabled }: TagPickerProps) {
  return (
    <select
      className={`tag-picker tag-${value ?? "none"}`}
      value={value ?? ""}
      disabled={disabled}
      onChange={(e) => {
        const v = e.target.value;
        onChange(v === "" ? null : (v as TagValue));
      }}
    >
      <option value="">—</option>
      {TAG_VALUES.map((t) => (
        <option key={t} value={t}>
          {t}
        </option>
      ))}
    </select>
  );
}
