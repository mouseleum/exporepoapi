import { createReadStream } from "node:fs";
import { parse } from "csv-parse";

const path = process.argv[2];
if (!path) {
  console.error("Usage: pnpm tsx scripts/count-rows.ts <csv-path>");
  process.exit(1);
}

const parser = createReadStream(path).pipe(
  parse({
    columns: true,
    skip_empty_lines: true,
    relax_quotes: true,
    bom: true,
  }),
);

let count = 0;
let withApolloId = 0;
let withoutApolloId = 0;
parser.on("error", (err) => {
  console.error("Parser error:", err);
  process.exit(1);
});

(async () => {
  for await (const row of parser as AsyncIterable<Record<string, string>>) {
    count++;
    const id = row["Apollo Account Id"];
    if (id && id.trim() !== "") withApolloId++;
    else withoutApolloId++;
  }
  console.log(
    `total=${count} with_apollo_id=${withApolloId} missing_apollo_id=${withoutApolloId}`,
  );
})().catch((e: unknown) => {
  console.error(e);
  process.exit(1);
});
