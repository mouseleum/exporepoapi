import { config as loadEnv } from "dotenv";
loadEnv({ path: ".env.local" });
loadEnv();
import { createServiceClient } from "../lib/supabase";
import { ADAPTERS } from "../lib/adapters/registry";
import { loadEventForAdapter } from "../lib/library/load-event";

async function main(): Promise<void> {
  const slug = process.argv[2];
  if (!slug) {
    console.error(
      `Usage: pnpm load:event <adapter>\nKnown adapters: ${Object.keys(ADAPTERS).join(", ")}`,
    );
    process.exit(1);
  }
  const adapter = ADAPTERS[slug];
  if (!adapter) {
    console.error(
      `Unknown adapter: ${slug}\nKnown adapters: ${Object.keys(ADAPTERS).join(", ")}`,
    );
    process.exit(1);
  }

  const supabase = createServiceClient();
  console.log(`Fetching exhibitors from ${adapter.meta.source_url}...`);
  const result = await loadEventForAdapter(adapter, supabase);
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
