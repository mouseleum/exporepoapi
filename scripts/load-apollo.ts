import "dotenv/config";
import { createReadStream } from "node:fs";
import { parse } from "csv-parse";
import { createServiceClient } from "../lib/supabase";
import {
  mapApolloRow,
  MissingApolloIdError,
  type ApolloCompanyInsert,
} from "./apollo-row";

const BATCH_SIZE = 500;

type Args = { csvPath: string; limit: number | null };

function parseArgs(argv: string[]): Args {
  const positional = argv.filter((a) => !a.startsWith("--"));
  const flags = argv.filter((a) => a.startsWith("--"));

  const csvPath = positional[0];
  if (!csvPath) {
    console.error(
      "Usage: pnpm load:apollo <csv-path> [--limit N]",
    );
    process.exit(1);
  }

  let limit: number | null = null;
  for (const f of flags) {
    if (f.startsWith("--limit=")) {
      const n = Number(f.slice("--limit=".length));
      if (!Number.isFinite(n) || n <= 0) {
        console.error(`Invalid --limit value: ${f}`);
        process.exit(1);
      }
      limit = n;
    }
  }

  return { csvPath, limit };
}

async function flush(
  supabase: ReturnType<typeof createServiceClient>,
  batch: ApolloCompanyInsert[],
): Promise<void> {
  if (batch.length === 0) return;
  const { error } = await supabase
    .from("companies")
    .upsert(batch, { onConflict: "apollo_account_id" });
  if (error) {
    console.error("Supabase upsert error:", error);
    throw new Error(error.message);
  }
}

async function main(): Promise<void> {
  const { csvPath, limit } = parseArgs(process.argv.slice(2));

  const supabase = createServiceClient();

  const parser = createReadStream(csvPath).pipe(
    parse({
      columns: true,
      skip_empty_lines: true,
      relax_quotes: true,
      bom: true,
    }),
  );

  let processed = 0;
  let upserted = 0;
  let skippedMissingId = 0;
  let batch: ApolloCompanyInsert[] = [];

  const start = Date.now();
  for await (const raw of parser as AsyncIterable<Record<string, string>>) {
    if (limit !== null && processed >= limit) break;
    processed++;
    try {
      batch.push(mapApolloRow(raw));
    } catch (err) {
      if (err instanceof MissingApolloIdError) {
        skippedMissingId++;
        continue;
      }
      throw err;
    }
    if (batch.length >= BATCH_SIZE) {
      await flush(supabase, batch);
      upserted += batch.length;
      batch = [];
      if (upserted % 1000 === 0 || upserted < 1000) {
        console.log(`upserted ${upserted} (processed ${processed})`);
      }
    }
  }

  await flush(supabase, batch);
  upserted += batch.length;

  const elapsed = ((Date.now() - start) / 1000).toFixed(1);
  console.log(
    `\nDone. processed=${processed} upserted=${upserted} skipped_missing_id=${skippedMissingId} elapsed=${elapsed}s`,
  );
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
