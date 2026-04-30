import { config as loadEnv } from "dotenv";
loadEnv({ path: ".env.local" });
loadEnv();
import { createServiceClient } from "../lib/supabase";

async function main(): Promise<void> {
  const slug = process.argv[2];
  if (!slug) {
    console.error("Usage: pnpm tsx scripts/verify-event.ts <event-slug>");
    process.exit(1);
  }
  const supabase = createServiceClient();

  const { data: ev, error: evErr } = await supabase
    .from("events")
    .select("id,source,slug,name,year,scraped_at")
    .eq("slug", slug)
    .single();
  if (evErr || !ev) {
    console.error("event not found:", evErr);
    process.exit(1);
  }
  console.log("event:", ev);

  const { count, error: cErr } = await supabase
    .from("event_exhibitors")
    .select("*", { count: "exact", head: true })
    .eq("event_id", ev.id as string);
  if (cErr) {
    console.error("count error:", cErr);
    process.exit(1);
  }
  console.log("event_exhibitors count:", count);

  const { data: sample } = await supabase
    .from("event_exhibitors")
    .select("raw_name,name_normalized")
    .eq("event_id", ev.id as string)
    .order("raw_name")
    .limit(5);
  console.log("sample:", sample);

  const { data: dash } = await supabase
    .from("event_exhibitors")
    .select("raw_name")
    .eq("event_id", ev.id as string)
    .ilike("raw_name", "%APPROACH%");
  console.log("entity-decode check:", dash);
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
