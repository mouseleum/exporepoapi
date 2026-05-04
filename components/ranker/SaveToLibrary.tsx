"use client";

import { useEffect, useState } from "react";

export function slugify(name: string, year: number | null): string {
  const base = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  if (!base) return "";
  return year ? `${base}-${year}` : base;
}

type SaveToLibraryProps = {
  defaultName: string;
  isSaving: boolean;
  onSave: (meta: { name: string; slug: string; year: number | null }) => void;
};

export function SaveToLibrary({
  defaultName,
  isSaving,
  onSave,
}: SaveToLibraryProps) {
  const [name, setName] = useState(defaultName);
  const [year, setYear] = useState<string>(String(new Date().getFullYear()));
  const [slug, setSlug] = useState<string>("");
  const [slugTouched, setSlugTouched] = useState(false);

  useEffect(() => {
    if (slugTouched) return;
    const y = year.trim() ? Number(year) : null;
    setSlug(slugify(name, Number.isFinite(y) ? y : null));
  }, [name, year, slugTouched]);

  const yearNum = year.trim() ? Number(year) : null;
  const yearValid = yearNum === null || (Number.isInteger(yearNum) && yearNum >= 1900 && yearNum <= 2100);
  const canSave =
    !isSaving && name.trim().length > 0 && slug.trim().length > 0 && yearValid;

  return (
    <div className="save-library">
      <div className="save-library-title">Save this list to the Library</div>
      <div className="save-library-fields">
        <label className="save-library-field">
          <span>Event name</span>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Vitafoods Europe"
            disabled={isSaving}
          />
        </label>
        <label className="save-library-field save-library-year">
          <span>Year</span>
          <input
            type="number"
            value={year}
            onChange={(e) => setYear(e.target.value)}
            placeholder="2026"
            disabled={isSaving}
          />
        </label>
        <label className="save-library-field">
          <span>Slug</span>
          <input
            type="text"
            value={slug}
            onChange={(e) => {
              setSlug(e.target.value);
              setSlugTouched(true);
            }}
            placeholder="vitafoods-europe-2026"
            disabled={isSaving}
          />
        </label>
      </div>
      <button
        type="button"
        className="btn"
        disabled={!canSave}
        onClick={() =>
          onSave({ name: name.trim(), slug: slug.trim(), year: yearNum })
        }
        style={{
          borderColor: "var(--color-accent-blue)",
          color: "var(--color-accent-blue)",
        }}
      >
        Save to Library
      </button>
    </div>
  );
}
