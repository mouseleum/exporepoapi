import { config as loadEnv } from "dotenv";
loadEnv({ path: ".env.local" });
loadEnv();

import { createServiceClient } from "../lib/supabase";
import { toISO } from "../lib/country-names";

// One-shot sweep that rewrites every country string in `companies` to its
// ISO-3166-1 alpha-2 code. Apollo's bulk import seeded full English names
// ("United Kingdom", "Germany"); Phase B's standalone merge mixed in
// 2-letter codes. This collapses both to ISO.
//
// Does NOT touch country_confidence — these aren't manual overrides,
// just format normalization. Rows with country_confidence already set
// keep their existing value.

const PAGE_SIZE = 1000;

type Row = { id: string; country: string };
type Update = { id: string; before: string; after: string };

function parseArgs(argv: string[]): { apply: boolean } {
  return { apply: argv.includes("--apply") };
}

async function fetchAll(
  supabase: ReturnType<typeof createServiceClient>,
): Promise<Row[]> {
  const out: Row[] = [];
  let from = 0;
  for (;;) {
    const { data, error } = await supabase
      .from("companies")
      .select("id, country")
      .not("country", "is", null)
      .range(from, from + PAGE_SIZE - 1);
    if (error) throw new Error(`select: ${error.message}`);
    const rows = (data ?? []) as Row[];
    out.push(...rows);
    if (rows.length < PAGE_SIZE) break;
    from += PAGE_SIZE;
  }
  return out;
}

async function main(): Promise<void> {
  const { apply } = parseArgs(process.argv.slice(2));
  const supabase = createServiceClient();

  console.log("→ Fetching companies with country…");
  const rows = await fetchAll(supabase);
  console.log(`  ${rows.length} rows`);

  const updates: Update[] = [];
  const unmapped = new Map<string, number>(); // before → count
  let alreadyIso = 0;

  for (const r of rows) {
    const before = r.country?.trim() ?? "";
    if (!before) continue;
    if (/^[A-Z]{2}$/.test(before)) {
      alreadyIso++;
      continue;
    }
    const iso = toISO(before);
    if (!iso) {
      unmapped.set(before, (unmapped.get(before) ?? 0) + 1);
      continue;
    }
    if (iso !== before) {
      updates.push({ id: r.id, before, after: iso });
    }
  }

  console.log("");
  console.log("═══ Plan ═══");
  console.log(`  =${alreadyIso} already ISO (skip)`);
  console.log(`  ~${updates.length} to normalize`);
  console.log(`  ?${unmapped.size} unmapped country strings (will be left alone)`);
  console.log("");

  if (unmapped.size > 0) {
    const sorted = Array.from(unmapped.entries()).sort((a, b) => b[1] - a[1]);
    console.log("Unmapped countries (consider adding to lib/country-names.ts):");
    for (const [name, n] of sorted) {
      console.log(`  ${String(n).padStart(4)}  ${JSON.stringify(name)}`);
    }
    console.log("");
  }

  // Group updates by (before → after) for a digestible summary.
  const grouped = new Map<string, number>();
  for (const u of updates) {
    const k = `${u.before} → ${u.after}`;
    grouped.set(k, (grouped.get(k) ?? 0) + 1);
  }
  if (grouped.size > 0) {
    console.log(`Top normalizations (${grouped.size} unique pairs):`);
    const sorted = Array.from(grouped.entries()).sort((a, b) => b[1] - a[1]).slice(0, 30);
    for (const [pair, n] of sorted) {
      console.log(`  ${String(n).padStart(4)}  ${pair}`);
    }
    console.log("");
  }

  if (!apply) {
    console.log("Dry-run — pass --apply to write.");
    return;
  }

  console.log("→ Applying…");
  for (let i = 0; i < updates.length; i++) {
    const u = updates[i]!;
    const { error } = await supabase
      .from("companies")
      .update({ country: u.after })
      .eq("id", u.id);
    if (error) throw new Error(`update ${u.id}: ${error.message}`);
    if ((i + 1) % 200 === 0 || i + 1 === updates.length) {
      console.log(`  ${i + 1}/${updates.length}`);
    }
  }
  console.log("Done.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
