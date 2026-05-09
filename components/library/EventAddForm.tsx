"use client";

import { useMemo, useState } from "react";
import { z } from "zod";
import { DimedisConfigSchema } from "@/lib/adapters/dimedis";
import { MapYourShowConfigSchema } from "@/lib/adapters/mapyourshow";
import type { CreateEventInput } from "@/lib/library/admin-queries";

type Family = "dimedis" | "cyberseceurope" | "mapyourshow";

const FAMILY_LABELS: Record<Family, string> = {
  dimedis: "DIMEDIS Vis (interpack, drupa, medica, glasstec, boot, …)",
  cyberseceurope: "Cybersec Europe (static HTML)",
  mapyourshow: "MapYourShow (Battery Show, NAB, IBC, …)",
};

const FAMILIES: Family[] = ["dimedis", "cyberseceurope", "mapyourshow"];

function slugify(name: string, year: number | null): string {
  const base = name
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return year ? `${base}-${year}` : base;
}

type Props = {
  onCreate: (input: CreateEventInput) => Promise<void>;
  busy: boolean;
};

export function EventAddForm({ onCreate, busy }: Props) {
  const [family, setFamily] = useState<Family>("dimedis");
  const [name, setName] = useState("");
  const [year, setYear] = useState<string>("");
  const [slug, setSlug] = useState("");
  const [slugDirty, setSlugDirty] = useState(false);
  const [sourceUrl, setSourceUrl] = useState("");
  const [romifyAttending, setRomifyAttending] = useState(true);

  // dimedis-only config
  const [domain, setDomain] = useState("");
  const [lang, setLang] = useState("");
  const [minExhibitors, setMinExhibitors] = useState("");

  const [formError, setFormError] = useState<string | null>(null);

  const yearNum = useMemo<number | null>(() => {
    if (year.trim() === "") return null;
    const n = Number(year);
    return Number.isInteger(n) ? n : null;
  }, [year]);

  const autoSlug = useMemo(
    () => (name.trim() ? slugify(name, yearNum) : ""),
    [name, yearNum],
  );
  const effectiveSlug = slugDirty ? slug : autoSlug;

  const reset = () => {
    setName("");
    setYear("");
    setSlug("");
    setSlugDirty(false);
    setSourceUrl("");
    setDomain("");
    setLang("");
    setMinExhibitors("");
    setRomifyAttending(true);
    setFormError(null);
  };

  const buildAdapterConfig = (): unknown => {
    if (family === "cyberseceurope") return {};
    const cfg: Record<string, unknown> = {};
    if (domain.trim()) cfg.domain = domain.trim();
    if (family === "dimedis" && lang.trim()) cfg.lang = lang.trim();
    if (minExhibitors.trim() !== "") {
      const n = Number(minExhibitors);
      if (Number.isInteger(n) && n >= 0) cfg.minExhibitors = n;
    }
    return cfg;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    if (!name.trim()) return setFormError("Name is required.");
    if (!effectiveSlug) return setFormError("Slug is required.");
    if (!sourceUrl.trim()) return setFormError("Source URL is required.");

    const adapterConfig = buildAdapterConfig();
    const schema =
      family === "dimedis"
        ? DimedisConfigSchema
        : family === "mapyourshow"
          ? MapYourShowConfigSchema
          : null;
    if (schema) {
      const parsed = schema.safeParse(adapterConfig);
      if (!parsed.success) {
        return setFormError(
          parsed.error.issues
            .map((i) => `${i.path.join(".") || "config"}: ${i.message}`)
            .join("; "),
        );
      }
    }

    try {
      await onCreate({
        source: family,
        slug: effectiveSlug,
        name: name.trim(),
        year: yearNum,
        source_url: sourceUrl.trim(),
        adapter_config: adapterConfig,
        romify_attending: romifyAttending,
      });
      reset();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : String(err));
    }
  };

  return (
    <form className="event-add-form" onSubmit={handleSubmit}>
      <div className="event-add-grid">
        <label className="event-add-field">
          <span>Adapter family</span>
          <select
            value={family}
            onChange={(e) => setFamily(e.target.value as Family)}
            disabled={busy}
          >
            {FAMILIES.map((f) => (
              <option key={f} value={f}>
                {FAMILY_LABELS[f]}
              </option>
            ))}
          </select>
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

        <label className="event-add-field event-add-field-wide">
          <span>Source URL</span>
          <input
            type="url"
            value={sourceUrl}
            onChange={(e) => setSourceUrl(e.target.value)}
            placeholder={
              family === "cyberseceurope"
                ? "https://www.cyberseceurope.com/visit/exhibitor-list"
                : family === "mapyourshow"
                  ? "https://tbse26.mapyourshow.com/8_0/explore/exhibitor-gallery.cfm?featured=false"
                  : "https://www.example.com/vis/v1/en/directory/a"
            }
            disabled={busy}
            required
          />
        </label>

        {(family === "dimedis" || family === "mapyourshow") && (
          <>
            <label className="event-add-field">
              <span>
                Domain {family === "dimedis" ? "(X-Vis-Domain)" : "(host)"}
              </span>
              <input
                type="text"
                value={domain}
                onChange={(e) => setDomain(e.target.value)}
                placeholder={
                  family === "dimedis"
                    ? "www.drupa.com"
                    : "tbse26.mapyourshow.com"
                }
                disabled={busy}
                required
              />
            </label>
            {family === "dimedis" && (
              <label className="event-add-field">
                <span>Lang (optional)</span>
                <input
                  type="text"
                  value={lang}
                  onChange={(e) => setLang(e.target.value)}
                  placeholder="en"
                  disabled={busy}
                />
              </label>
            )}
            <label className="event-add-field">
              <span>Min exhibitors (optional)</span>
              <input
                type="number"
                value={minExhibitors}
                onChange={(e) => setMinExhibitors(e.target.value)}
                placeholder="50"
                min="0"
                disabled={busy}
              />
            </label>
          </>
        )}

        <label className="event-add-field event-add-checkbox">
          <input
            type="checkbox"
            checked={romifyAttending}
            onChange={(e) => setRomifyAttending(e.target.checked)}
            disabled={busy}
          />
          <span>My company is attending</span>
        </label>
      </div>

      {formError && <div className="event-add-error">{formError}</div>}

      <div className="event-add-actions">
        <button type="submit" className="btn btn-primary" disabled={busy}>
          Add event
        </button>
      </div>
    </form>
  );
}

// Re-export for tests — keeps the slug helper checkable in isolation.
export const __test__ = { slugify, schemas: { dimedis: DimedisConfigSchema as z.ZodTypeAny } };
