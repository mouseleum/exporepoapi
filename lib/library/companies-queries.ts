import { createServiceClient } from "@/lib/supabase";

// Phase D of the company-db-agent merge (docs/company-db-merge.md).
// Server-side queries powering /library/companies — the override UI that
// replaces the standalone's drag-drop+inline-edit page.
//
// Phase 9 added the optional `hubspot` field per row, populated by a
// separate fetch of company_hubspot_signals merged in JS (rather than a
// PostgREST FK join) so the query doesn't change shape when no HubSpot
// signals exist yet.

const PAGE_SIZE = 1000;

export type HubspotSignals = {
  met_by_me: boolean;
  met_by_team: boolean;
  in_pipeline: boolean;
  last_engagement_at: string | null;
  last_engagement_owner_name: string | null;
  latest_open_deal_stage: string | null;
  latest_open_deal_amount: number | null;
};

export type CompanyRow = {
  id: string;
  name: string;
  name_normalized: string;
  country: string | null;
  country_confidence: string | null;
  country_sources: string[];
  aliases: string[];
  source: string;
  updated_at: string | null;
  hubspot: HubspotSignals | null;
};

export async function listCompanies(): Promise<CompanyRow[]> {
  const supabase = createServiceClient();
  const out: CompanyRow[] = [];
  let from = 0;
  for (;;) {
    const { data, error } = await supabase
      .from("companies")
      .select(
        "id, name, name_normalized, country, country_confidence, country_sources, aliases, source, updated_at",
      )
      .order("name", { ascending: true })
      .range(from, from + PAGE_SIZE - 1);
    if (error) throw new Error(`listCompanies: ${error.message}`);
    const rows = (data ?? []) as Array<Omit<CompanyRow, "hubspot">>;
    for (const r of rows) {
      out.push({
        ...r,
        country_sources: r.country_sources ?? [],
        aliases: r.aliases ?? [],
        hubspot: null,
      });
    }
    if (rows.length < PAGE_SIZE) break;
    from += PAGE_SIZE;
  }

  // Pull HubSpot signals in a single fetch and merge by company_id. Cheap —
  // even at full HubSpot match it's ~hundreds of rows, far below PAGE_SIZE.
  const signals = await loadHubspotSignals(supabase);
  if (signals.size > 0) {
    for (const row of out) {
      const sig = signals.get(row.id);
      if (sig) row.hubspot = sig;
    }
  }

  return out;
}

async function loadHubspotSignals(
  supabase: ReturnType<typeof createServiceClient>,
): Promise<Map<string, HubspotSignals>> {
  const out = new Map<string, HubspotSignals>();
  let from = 0;
  for (;;) {
    const { data, error } = await supabase
      .from("company_hubspot_signals")
      .select(
        "company_id, met_by_me, met_by_team, in_pipeline, last_engagement_at, last_engagement_owner_name, latest_open_deal_stage, latest_open_deal_amount",
      )
      .range(from, from + PAGE_SIZE - 1);
    if (error) {
      // Table may not exist yet on environments where 0009 wasn't applied;
      // treat as no signals rather than crashing the whole companies view.
      if (error.message.toLowerCase().includes("does not exist")) return new Map();
      throw new Error(`loadHubspotSignals: ${error.message}`);
    }
    const rows = (data ?? []) as Array<
      { company_id: string } & HubspotSignals
    >;
    for (const r of rows) {
      const { company_id, ...sig } = r;
      out.set(company_id, sig);
    }
    if (rows.length < PAGE_SIZE) break;
    from += PAGE_SIZE;
  }
  return out;
}

export async function overrideCompanyCountry(
  id: string,
  iso: string,
): Promise<CompanyRow> {
  if (!/^[A-Z]{2}$/.test(iso)) {
    throw new Error(`Country must be a 2-letter ISO code; got ${JSON.stringify(iso)}`);
  }

  const supabase = createServiceClient();

  // Read existing sources so we can dedup-append 'manual'.
  const { data: existingRow, error: readErr } = await supabase
    .from("companies")
    .select("country_sources")
    .eq("id", id)
    .single();
  if (readErr) throw new Error(`overrideCompanyCountry read: ${readErr.message}`);

  const existingSources = (existingRow?.country_sources ?? []) as string[];
  const sources = existingSources.includes("manual")
    ? existingSources
    : [...existingSources, "manual"];

  const { data, error } = await supabase
    .from("companies")
    .update({
      country: iso,
      country_confidence: "override",
      country_updated_at: new Date().toISOString(),
      country_sources: sources,
    })
    .eq("id", id)
    .select(
      "id, name, name_normalized, country, country_confidence, country_sources, aliases, source, updated_at",
    )
    .single();
  if (error) throw new Error(`overrideCompanyCountry update: ${error.message}`);

  const row = data as Omit<CompanyRow, "hubspot">;
  // hubspot is in a sibling table; the caller is responsible for re-merging
  // the prior signal (the override action doesn't change HubSpot state).
  return {
    ...row,
    country_sources: row.country_sources ?? [],
    aliases: row.aliases ?? [],
    hubspot: null,
  };
}
