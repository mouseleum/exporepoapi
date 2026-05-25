import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase";

// Phase C of the company-db-agent merge (docs/company-db-merge.md).
// Browser-side loadDB() calls this endpoint instead of the standalone
// company-db-agent. Returns the legacy shape the client already parses:
// { normalized, raw[], country }. `normalized` ← name, `raw[]` ← aliases.

export const dynamic = "force-dynamic";

const PAGE_SIZE = 1000;

type Row = { name: string; aliases: string[] | null; country: string | null };

export async function GET(): Promise<Response> {
  const supabase = createServiceClient();
  const out: Array<{ normalized: string; raw: string[]; country: string }> = [];
  let from = 0;
  // Supabase caps select() at 1000 rows by default; page through.
  for (;;) {
    const { data, error } = await supabase
      .from("companies")
      .select("name, aliases, country")
      .not("country", "is", null)
      .range(from, from + PAGE_SIZE - 1);
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    const rows = (data ?? []) as Row[];
    for (const r of rows) {
      if (!r.country) continue;
      out.push({
        normalized: r.name,
        raw: r.aliases ?? [],
        country: r.country,
      });
    }
    if (rows.length < PAGE_SIZE) break;
    from += PAGE_SIZE;
  }
  return NextResponse.json(out);
}
