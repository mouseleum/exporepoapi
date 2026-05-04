import { config as loadEnv } from "dotenv";
loadEnv({ path: ".env.local" });
loadEnv();
import { createServiceClient } from "../lib/supabase";
import { refreshAllEvents } from "../lib/library/refresh";

async function main(): Promise<void> {
  const supabase = createServiceClient();
  const summary = await refreshAllEvents(supabase);

  for (const r of summary.results) {
    if (r.status === "ok") {
      console.log(
        `ok      ${r.slug.padEnd(28)} exhibitors=${r.upserted} dupes=${r.dupes} elapsed=${(r.elapsed_ms / 1000).toFixed(1)}s`,
      );
    } else if (r.status === "skipped") {
      console.log(
        `skip    ${r.slug.padEnd(28)} source=${r.source} (${r.reason})`,
      );
    } else {
      console.log(`error   ${r.slug.padEnd(28)} ${r.error}`);
    }
  }
  console.log(
    `\ndone: ok=${summary.ok} skipped=${summary.skipped} errors=${summary.errors} elapsed=${(summary.elapsed_ms / 1000).toFixed(1)}s`,
  );
  if (summary.errors > 0) process.exit(1);
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
