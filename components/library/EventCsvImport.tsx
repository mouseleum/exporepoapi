"use client";

import { useMemo, useRef, useState } from "react";
import { slugify } from "@/lib/slug";
import { importEventCsv } from "@/app/library/admin/actions";
import type { ImportEventCsvResult } from "@/lib/library/import-csv";

type Props = {
  onImported: () => Promise<void> | void;
};

export function EventCsvImport({ onImported }: Props) {
  const [file, setFile] = useState<File | null>(null);
  const [name, setName] = useState("");
  const [year, setYear] = useState("");
  const [slug, setSlug] = useState("");
  const [slugDirty, setSlugDirty] = useState(false);
  const [sourceUrl, setSourceUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ImportEventCsvResult | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const yearNum = useMemo<number | null>(() => {
    if (year.trim() === "") return null;
    const n = Number(year);
    return Number.isFinite(n) ? n : null;
  }, [year]);

  const autoSlug = useMemo(
    () => (name.trim() ? slugify(name, yearNum) : ""),
    [name, yearNum],
  );
  const effectiveSlug = slugDirty ? slug : autoSlug;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setResult(null);
    if (!file) return setError("Choose a CSV file.");
    if (!name.trim()) return setError("Name is required.");
    if (!effectiveSlug.trim()) return setError("Slug is required.");

    setBusy(true);
    try {
      const csvText = await file.text();
      const res = await importEventCsv({
        slug: effectiveSlug.trim(),
        name: name.trim(),
        year: yearNum,
        source_url: sourceUrl.trim() || null,
        csvText,
      });
      setResult(res);
      setFile(null);
      if (fileRef.current) fileRef.current.value = "";
      await onImported();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <form className="event-add-form" onSubmit={handleSubmit}>
      <div className="event-add-grid">
        <label className="event-add-field event-add-field-wide">
          <span>Exhibitor CSV</span>
          <input
            ref={fileRef}
            type="file"
            accept=".csv,text/csv"
            disabled={busy}
            onChange={(e) => {
              setFile(e.target.files?.[0] ?? null);
              setResult(null);
              setError(null);
            }}
          />
        </label>

        <label className="event-add-field">
          <span>Name</span>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. drupa 2028"
            disabled={busy}
            required
          />
        </label>

        <label className="event-add-field">
          <span>Year</span>
          <input
            type="number"
            value={year}
            onChange={(e) => setYear(e.target.value)}
            placeholder="2028"
            min="2000"
            max="2100"
            disabled={busy}
          />
        </label>

        <label className="event-add-field">
          <span>Slug</span>
          <input
            type="text"
            value={effectiveSlug}
            onChange={(e) => {
              setSlug(e.target.value);
              setSlugDirty(true);
            }}
            placeholder="auto from name + year"
            disabled={busy}
            required
          />
        </label>

        <label className="event-add-field">
          <span>Source URL (optional)</span>
          <input
            type="url"
            value={sourceUrl}
            onChange={(e) => setSourceUrl(e.target.value)}
            placeholder="https://… the fair's exhibitor page"
            disabled={busy}
          />
        </label>
      </div>

      {error && <div className="event-add-error">{error}</div>}

      {result && (
        <div className="csv-import-result">
          Imported <strong>{result.imported}</strong> exhibitors into{" "}
          <code>{result.slug}</code>
          {result.dupes > 0 && <> · {result.dupes} duplicate name(s) merged</>}
          {result.skippedNoName > 0 && (
            <> · {result.skippedNoName} row(s) had no company name</>
          )}
          <div className="csv-import-cols">
            Columns used: name=<code>{result.columns.name}</code>
            {result.columns.country && (
              <> · country=<code>{result.columns.country}</code></>
            )}
            {result.columns.hall && (
              <> · hall=<code>{result.columns.hall}</code></>
            )}
            {result.columns.booth && (
              <> · booth=<code>{result.columns.booth}</code></>
            )}
          </div>
        </div>
      )}

      <div className="event-add-actions">
        <button type="submit" className="btn btn-primary" disabled={busy}>
          {busy ? "Importing…" : "Import CSV"}
        </button>
      </div>
    </form>
  );
}
