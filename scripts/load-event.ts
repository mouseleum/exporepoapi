import { config as loadEnv } from "dotenv";
loadEnv({ path: ".env.local" });
loadEnv();
import { createServiceClient } from "../lib/supabase";
import { adapterFamilies } from "../lib/adapters/registry";
import { loadEventForRow, type EventRow } from "../lib/library/load-event";

async function main(): Promise<void> {
  const slug = process.argv[2];
  if (!slug) {
    console.error(
      `Usage: pnpm load:event <event-slug>\nKnown adapter families: ${adapterFamilies().join(", ")}`,
    );
    process.exit(1);
  }

  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from("events")
    .select("source, slug, name, year, source_url, adapter_config")
    .eq("slug", slug)
    .single();
  if (error || !data) {
    console.error(`event not found: ${slug} (${error?.message ?? "no row"})`);
    process.exit(1);
  }
  const row = data as EventRow;

  if (!adapterFamilies().includes(row.source)) {
    console.error(
      `event ${slug} has source='${row.source}' which has no adapter family registered. Known families: ${adapterFamilies().join(", ")}`,
    );
    process.exit(1);
  }

  console.log(`Fetching exhibitors for ${slug} via ${row.source} family...`);
  const result = await loadEventForRow(row, supabase);
  if (result.dupes > 0) {
    console.log(`Skipped ${result.dupes} duplicate name_normalized rows.`);
  }
  console.log(
    `event=${result.slug} exhibitors=${result.upserted} elapsed=${(result.elapsed_ms / 1000).toFixed(1)}s`,
  );
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
