import { config as loadEnv } from "dotenv";
loadEnv({ path: ".env.local" });
loadEnv();
import { createServiceClient } from "../lib/supabase";
import { normalizeName } from "../lib/normalize";
import type { Adapter } from "../lib/adapters/types";
import { cyberseceuropeAdapter } from "../lib/adapters/cyberseceurope";
import { interpackAdapter } from "../lib/adapters/interpack";

const ADAPTERS: Record<string, Adapter> = {
  cyberseceurope: cyberseceuropeAdapter,
  interpack: interpackAdapter,
};

const BATCH_SIZE = 500;

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
  const start = Date.now();

  console.log(`Fetching exhibitors from ${adapter.meta.source_url}...`);
  const exhibitors = await adapter.fetch();
  console.log(`Fetched ${exhibitors.length} exhibitors.`);

  const eventRow = {
    source: adapter.meta.source,
    slug: adapter.meta.slug,
    name: adapter.meta.name,
    year: adapter.meta.year,
    source_url: adapter.meta.source_url,
    scraped_at: new Date().toISOString(),
  };

  const { data: eventInsert, error: eventErr } = await supabase
    .from("events")
    .upsert(eventRow, { onConflict: "slug" })
    .select("id")
    .single();
  if (eventErr || !eventInsert) {
    console.error("events upsert error:", eventErr);
    process.exit(1);
  }
  const eventId = eventInsert.id as string;

  const rows = exhibitors.map((x) => ({
    event_id: eventId,
    raw_name: x.raw_name,
    name_normalized: normalizeName(x.raw_name),
    country: x.country ?? null,
    hall: x.hall ?? null,
    booth: x.booth ?? null,
  }));

  let upserted = 0;
  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const batch = rows.slice(i, i + BATCH_SIZE);
    const { error } = await supabase
      .from("event_exhibitors")
      .upsert(batch, { onConflict: "event_id,name_normalized" });
    if (error) {
      console.error("event_exhibitors upsert error:", error);
      process.exit(1);
    }
    upserted += batch.length;
  }

  const elapsed = ((Date.now() - start) / 1000).toFixed(1);
  console.log(
    `event=${adapter.meta.slug} exhibitors=${upserted} elapsed=${elapsed}s`,
  );
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
