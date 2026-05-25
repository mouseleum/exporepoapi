import { config as loadEnv } from "dotenv";
loadEnv({ path: ".env.local" });
loadEnv();

import { createServiceClient } from "../lib/supabase";
import { normalizeName } from "../lib/normalize";

// Phase B of the company-db-agent merge (docs/company-db-merge.md).
// Pulls every record from the standalone DB and merges into Supabase
// `companies`. Dry-run by default — pass --apply to write.

const STANDALONE_URL = "https://company-db-agent.vercel.app/api/companies";
const CHUNK_SIZE = 500;

const CONFIDENCE_RANK: Record<string, number> = {
  override: 4,
  pdl: 3,
  wiki: 2,
  suffix: 1,
};

type Confidence = "override" | "pdl" | "wiki" | "suffix";

type StandaloneRecord = {
  id: string;
  raw: string[];
  normalized: string;
  country: string | null;
  confidence: Confidence | null;
  employees: number | null;
  industry: string | null;
  source: string[];
  updatedAt: string;
};

type ExistingRow = {
  id: string;
  name_normalized: string;
  country: string | null;
  country_confidence: string | null;
  aliases: string[] | null;
  country_sources: string[] | null;
};

type InsertPlan = {
  apollo_account_id: string;
  source: string;
  name: string;
  name_normalized: string;
  country: string | null;
  employees: number | null;
  industry: string | null;
  aliases: string[];
  country_confidence: string | null;
  country_sources: string[];
  country_updated_at: string | null;
};

type UpdatePlan = {
  id: string;
  key: string;
  before: ExistingRow;
  patch: Record<string, unknown>;
  reason: string;
};

type Args = { apply: boolean; limit: number | null; conflicts: boolean };

function parseArgs(argv: string[]): Args {
  const apply = argv.includes("--apply");
  const conflicts = argv.includes("--conflicts");
  let limit: number | null = null;
  for (const f of argv) {
    if (f.startsWith("--limit=")) {
      const n = Number(f.slice("--limit=".length));
      if (!Number.isFinite(n) || n <= 0) {
        console.error(`Invalid --limit value: ${f}`);
        process.exit(1);
      }
      limit = n;
    }
  }
  return { apply, limit, conflicts };
}

function dedup(arr: ReadonlyArray<string | null | undefined>): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const v of arr) {
    if (!v) continue;
    if (seen.has(v)) continue;
    seen.add(v);
    out.push(v);
  }
  return out;
}

function toIsoTimestamp(date: string | null | undefined): string | null {
  if (!date) return null;
  const d = new Date(date);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

async function fetchStandalone(): Promise<StandaloneRecord[]> {
  const res = await fetch(STANDALONE_URL);
  if (!res.ok) {
    throw new Error(`Fetch ${STANDALONE_URL} failed: ${res.status}`);
  }
  const json = (await res.json()) as StandaloneRecord[];
  if (!Array.isArray(json)) {
    throw new Error(`Unexpected /api/companies shape: ${typeof json}`);
  }
  return json;
}

async function chunkedSelectExisting(
  supabase: ReturnType<typeof createServiceClient>,
  keys: string[],
): Promise<Map<string, ExistingRow>> {
  const map = new Map<string, ExistingRow>();
  for (let i = 0; i < keys.length; i += CHUNK_SIZE) {
    const chunk = keys.slice(i, i + CHUNK_SIZE);
    const { data, error } = await supabase
      .from("companies")
      .select(
        "id, name_normalized, country, country_confidence, aliases, country_sources",
      )
      .in("name_normalized", chunk);
    if (error) throw new Error(`select: ${error.message}`);
    for (const row of (data ?? []) as ExistingRow[]) {
      map.set(row.name_normalized, row);
    }
  }
  return map;
}

function collapseStandalone(
  records: StandaloneRecord[],
): Map<string, StandaloneRecord> {
  // Multiple standalone records can normalize to the same Supabase key.
  // Merge them in input order: highest confidence wins for country,
  // aliases and sources accumulate.
  const map = new Map<string, StandaloneRecord>();
  for (const r of records) {
    const key = normalizeName(r.normalized);
    if (!key) continue;
    const ex = map.get(key);
    if (!ex) {
      map.set(key, { ...r, raw: [...r.raw], source: [...r.source] });
      continue;
    }
    ex.raw = dedup([...ex.raw, ...r.raw]);
    ex.source = dedup([...ex.source, ...r.source]);
    const exRank = CONFIDENCE_RANK[ex.confidence ?? ""] ?? 0;
    const nuRank = CONFIDENCE_RANK[r.confidence ?? ""] ?? 0;
    if (r.country && nuRank > exRank) {
      ex.country = r.country;
      ex.confidence = r.confidence;
      ex.updatedAt = r.updatedAt;
    }
  }
  return map;
}

function buildInsert(key: string, r: StandaloneRecord): InsertPlan {
  return {
    apollo_account_id: `company-db:${r.id}`,
    source: "company-db-agent",
    name: r.normalized,
    name_normalized: key,
    country: r.country,
    employees: r.employees,
    industry: r.industry,
    aliases: dedup(r.raw),
    country_confidence: r.confidence,
    country_sources: dedup(r.source),
    country_updated_at: toIsoTimestamp(r.updatedAt),
  };
}

function buildUpdate(
  key: string,
  ex: ExistingRow,
  r: StandaloneRecord,
): UpdatePlan | null {
  const patch: Record<string, unknown> = {};
  const reasons: string[] = [];

  const exAliases = ex.aliases ?? [];
  const newAliases = dedup([...exAliases, ...r.raw]);
  if (newAliases.length !== exAliases.length) {
    patch.aliases = newAliases;
    reasons.push("aliases");
  }

  const exSources = ex.country_sources ?? [];
  const newSources = dedup([...exSources, ...r.source]);
  if (newSources.length !== exSources.length) {
    patch.country_sources = newSources;
    reasons.push("sources");
  }

  if (r.country && r.confidence) {
    const exRank = CONFIDENCE_RANK[ex.country_confidence ?? ""] ?? 0;
    const nuRank = CONFIDENCE_RANK[r.confidence] ?? 0;
    const shouldOverwrite =
      r.confidence === "override" ||
      ex.country === null ||
      nuRank > exRank;
    if (
      shouldOverwrite &&
      (r.country !== ex.country || r.confidence !== ex.country_confidence)
    ) {
      patch.country = r.country;
      patch.country_confidence = r.confidence;
      patch.country_updated_at =
        toIsoTimestamp(r.updatedAt) ?? new Date().toISOString();
      reasons.push("country");
    }
  }

  if (Object.keys(patch).length === 0) return null;
  return { id: ex.id, key, before: ex, patch, reason: reasons.join("+") };
}

function printConflicts(updates: UpdatePlan[]): void {
  // A "conflict" = the country string actually changes (after a loose
  // normalize). FR → FR is not a conflict; "Malaysia" → "MY" is. We
  // can't tell here whether "Malaysia" → "MY" is benign ISO normalization
  // or a real disagreement, so we group by pair and let the eyeball decide.
  type Conflict = { before: string | null; after: string; key: string; confidence: string };
  const all: Conflict[] = [];
  for (const u of updates) {
    if (!("country" in u.patch)) continue;
    const before = u.before.country;
    const after = u.patch.country as string;
    if (before && before.trim().toUpperCase() === after.trim().toUpperCase()) continue;
    all.push({
      before,
      after,
      key: u.key,
      confidence: (u.patch.country_confidence as string) ?? "?",
    });
  }

  if (all.length === 0) {
    console.log("No country-string conflicts — every country update is a no-op or empty→value.");
    return;
  }

  // Group by (before, after) pair, count, list affected keys
  const grouped = new Map<string, { before: string | null; after: string; keys: string[]; confidence: string }>();
  for (const c of all) {
    const k = `${c.before ?? "∅"}→${c.after}`;
    const g = grouped.get(k);
    if (g) g.keys.push(c.key);
    else grouped.set(k, { before: c.before, after: c.after, keys: [c.key], confidence: c.confidence });
  }
  const sorted = Array.from(grouped.values()).sort((a, b) => b.keys.length - a.keys.length);

  console.log("");
  console.log(`═══ Country diffs (${all.length} updates across ${sorted.length} unique pairs) ═══`);
  console.log("");
  for (const g of sorted) {
    const sample = g.keys.slice(0, 3).join(", ");
    const more = g.keys.length > 3 ? ` …+${g.keys.length - 3}` : "";
    console.log(
      `  ${String(g.keys.length).padStart(4)}  ${JSON.stringify(g.before).padEnd(20)} → ${JSON.stringify(g.after).padEnd(8)}  [${g.confidence}]   e.g. ${sample}${more}`,
    );
  }
  console.log("");
}

function printPlan(
  inserts: InsertPlan[],
  updates: UpdatePlan[],
  unchanged: number,
): void {
  console.log("");
  console.log("═══ Plan ═══");
  console.log(`  +${inserts.length} new rows`);
  console.log(`  ~${updates.length} updated rows`);
  console.log(`  =${unchanged} unchanged`);
  console.log("");

  if (inserts.length > 0) {
    console.log(`Sample inserts (${Math.min(5, inserts.length)} of ${inserts.length}):`);
    for (const ins of inserts.slice(0, 5)) {
      console.log(
        `  + ${ins.name} (${ins.country ?? "—"}, ${ins.country_confidence ?? "—"})`,
      );
    }
    console.log("");
  }

  if (updates.length > 0) {
    console.log(`Sample updates (${Math.min(5, updates.length)} of ${updates.length}):`);
    for (const u of updates.slice(0, 5)) {
      console.log(`  ~ ${u.key} [${u.reason}]`);
      for (const [k, v] of Object.entries(u.patch)) {
        const beforeVal = (u.before as Record<string, unknown>)[k];
        const fmt = (x: unknown) => JSON.stringify(x);
        console.log(`      ${k}: ${fmt(beforeVal)} → ${fmt(v)}`);
      }
    }
    console.log("");

    // Surface the high-value `override`-confidence updates separately so
    // they're never lost in the noise.
    const overrideUpdates = updates.filter(
      (u) => u.patch.country_confidence === "override",
    );
    if (overrideUpdates.length > 0) {
      console.log(`Override picks affecting Supabase (${overrideUpdates.length}):`);
      for (const u of overrideUpdates.slice(0, 20)) {
        console.log(
          `  ! ${u.key}: ${JSON.stringify(u.before.country)} → ${JSON.stringify(u.patch.country)}`,
        );
      }
      if (overrideUpdates.length > 20) {
        console.log(`  …and ${overrideUpdates.length - 20} more`);
      }
      console.log("");
    }
  }
}

async function applyInserts(
  supabase: ReturnType<typeof createServiceClient>,
  inserts: InsertPlan[],
): Promise<void> {
  if (inserts.length === 0) return;
  for (let i = 0; i < inserts.length; i += CHUNK_SIZE) {
    const chunk = inserts.slice(i, i + CHUNK_SIZE);
    const { error } = await supabase.from("companies").insert(chunk);
    if (error) throw new Error(`insert: ${error.message}`);
    console.log(`  inserted ${Math.min(i + chunk.length, inserts.length)}/${inserts.length}`);
  }
}

async function applyUpdates(
  supabase: ReturnType<typeof createServiceClient>,
  updates: UpdatePlan[],
): Promise<void> {
  if (updates.length === 0) return;
  for (let i = 0; i < updates.length; i++) {
    const u = updates[i]!;
    const { error } = await supabase
      .from("companies")
      .update(u.patch)
      .eq("id", u.id);
    if (error) throw new Error(`update ${u.id}: ${error.message}`);
    if ((i + 1) % 100 === 0 || i + 1 === updates.length) {
      console.log(`  updated ${i + 1}/${updates.length}`);
    }
  }
}

async function main(): Promise<void> {
  const { apply, limit, conflicts } = parseArgs(process.argv.slice(2));
  const supabase = createServiceClient();

  console.log(`→ Fetching standalone records from ${STANDALONE_URL}…`);
  let records = await fetchStandalone();
  console.log(`  ${records.length} records fetched`);
  if (limit !== null) {
    records = records.slice(0, limit);
    console.log(`  --limit=${limit} applied → ${records.length} records`);
  }

  const standaloneKeyed = collapseStandalone(records);
  console.log(`  ${standaloneKeyed.size} unique normalized keys`);

  console.log(`→ Looking up existing rows in companies…`);
  const existing = await chunkedSelectExisting(
    supabase,
    Array.from(standaloneKeyed.keys()),
  );
  console.log(`  ${existing.size} existing rows found`);

  const inserts: InsertPlan[] = [];
  const updates: UpdatePlan[] = [];
  let unchanged = 0;

  for (const [key, r] of standaloneKeyed) {
    const ex = existing.get(key);
    if (!ex) {
      inserts.push(buildInsert(key, r));
      continue;
    }
    const up = buildUpdate(key, ex, r);
    if (up) updates.push(up);
    else unchanged++;
  }

  printPlan(inserts, updates, unchanged);

  if (conflicts) {
    printConflicts(updates);
  }

  if (!apply) {
    console.log("Dry-run — pass --apply to write, --conflicts to inspect country diffs.");
    return;
  }

  console.log("→ Applying…");
  await applyInserts(supabase, inserts);
  await applyUpdates(supabase, updates);
  console.log("Done.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
