import type { SupabaseClient } from "@supabase/supabase-js";
import { loadHubspotAuth } from "./auth";
import {
  batchListAssociationsFromContacts,
  batchReadDeals,
  batchReadEngagements,
  formatOwnerName,
  listAssociations,
  listDealStages,
  listOwners,
  searchCompaniesByDomain,
  type HubSpotDeal,
  type HubSpotEngagement,
  type HubSpotEngagementType,
  type HubSpotOwner,
} from "./client";
import { extractRegistrableDomain } from "./domain";

// Phase 9 (HubSpot): pulls HubSpot Companies that match exporepoapi companies
// by registrable domain, derives met/pipeline signals from associated
// engagements + deals, and upserts company_hubspot_signals. Signal logic is
// in pure helpers below so it can be unit-tested without mocking the world.

const ENGAGEMENT_TYPES: HubSpotEngagementType[] = ["meetings", "calls", "emails", "notes"];

export type SyncSummary = {
  syncedAt: string;
  exporepoapiCompanies: number;
  domainsResolved: number;
  hubspotCompaniesMatched: number;
  signalsWritten: number;
  metByMeCount: number;
  metByTeamCount: number;
  inPipelineCount: number;
  errors: Array<{ companyId?: string; hubspotCompanyId?: string; message: string }>;
};

export type EngagementSignals = {
  metByMe: boolean;
  metByTeam: boolean;
  latest: HubSpotEngagement | null;
};

// Pure helper: given engagements for a single company and the current user's
// HubSpot owner_id, decide met_by_me / met_by_team and the most-recent
// engagement (ranked by timestamp; ties broken by id for determinism).
export function computeEngagementSignals(
  engagements: HubSpotEngagement[],
  currentUserOwnerId: string | null,
): EngagementSignals {
  let metByMe = false;
  let metByTeam = false;
  let latest: HubSpotEngagement | null = null;

  for (const e of engagements) {
    if (currentUserOwnerId && e.ownerId === currentUserOwnerId) metByMe = true;
    else metByTeam = true;

    if (!latest) {
      latest = e;
      continue;
    }
    const eTs = e.timestamp ?? "";
    const lTs = latest.timestamp ?? "";
    if (eTs > lTs || (eTs === lTs && e.id > latest.id)) latest = e;
  }
  return { metByMe, metByTeam, latest };
}

export type PipelineSignal = {
  inPipeline: boolean;
  latestOpenDealStage: string | null;
  latestOpenDealAmount: number | null;
};

// Pure helper: classify deals using the cached closed-stage set; the "latest
// open deal" surfaced for badging is the highest-amount open one (ties broken
// by id). Amount-based pick is more useful in the UI than recency since
// HubSpot deal createdate is rarely meaningful for prioritization.
export function pickPipelineSignal(
  deals: HubSpotDeal[],
  closedStageIds: Set<string>,
  stageLabelById: Map<string, string>,
): PipelineSignal {
  const open = deals.filter((d) => d.dealstage && !closedStageIds.has(d.dealstage));
  if (open.length === 0) {
    return { inPipeline: false, latestOpenDealStage: null, latestOpenDealAmount: null };
  }
  const sorted = [...open].sort((a, b) => {
    const av = a.amount ?? 0;
    const bv = b.amount ?? 0;
    if (av !== bv) return bv - av;
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  });
  const top = sorted[0]!;
  const label = top.dealstage ? stageLabelById.get(top.dealstage) ?? top.dealstage : null;
  return {
    inPipeline: true,
    latestOpenDealStage: label,
    latestOpenDealAmount: top.amount ?? null,
  };
}

// Main entry point.
export async function syncAllSignals(supabase: SupabaseClient): Promise<SyncSummary> {
  const syncStartIso = new Date().toISOString();
  const errors: SyncSummary["errors"] = [];

  const auth = await loadHubspotAuth();
  if (!auth) {
    throw new Error("HUBSPOT_ACCESS_TOKEN is not set");
  }
  const { accessToken, currentUserOwnerId } = auth;

  const companies = await loadExporepoCompanies(supabase);
  const domainToCompanyId = new Map<string, string>();
  for (const row of companies) {
    const d = extractRegistrableDomain(row.website);
    if (d && !domainToCompanyId.has(d)) domainToCompanyId.set(d, row.id);
  }
  const domains = Array.from(domainToCompanyId.keys());

  const hsCompanies = await searchCompaniesByDomain(accessToken, domains);

  const [owners, stages] = await Promise.all([
    listOwners(accessToken),
    listDealStages(accessToken),
  ]);
  const ownerById = new Map<string, HubSpotOwner>(owners.map((o) => [o.id, o]));
  const closedStageIds = new Set(stages.filter((s) => s.closed).map((s) => s.id));
  const stageLabelById = new Map(stages.map((s) => [s.id, s.label]));

  let signalsWritten = 0;
  let metByMeCount = 0;
  let metByTeamCount = 0;
  let inPipelineCount = 0;

  for (const hsCo of hsCompanies) {
    if (!hsCo.domain) continue;
    const exporepoCompanyId = domainToCompanyId.get(hsCo.domain.toLowerCase());
    if (!exporepoCompanyId) continue;

    try {
      // Engagements: via contacts (the more common attachment point).
      const contactIds = await listAssociations(
        accessToken,
        "companies",
        hsCo.id,
        "contacts",
      );
      const allEngagements: HubSpotEngagement[] = [];
      if (contactIds.length > 0) {
        for (const type of ENGAGEMENT_TYPES) {
          const associations = await batchListAssociationsFromContacts(
            accessToken,
            contactIds,
            type,
          );
          const engagementIds = new Set<string>();
          for (const list of associations.values()) {
            for (const id of list) engagementIds.add(id);
          }
          if (engagementIds.size === 0) continue;
          const engagements = await batchReadEngagements(
            accessToken,
            type,
            Array.from(engagementIds),
          );
          allEngagements.push(...engagements);
        }
      }
      const sig = computeEngagementSignals(allEngagements, currentUserOwnerId);

      // Deals: in-pipeline + latest-open stage/amount.
      const dealIds = await listAssociations(accessToken, "companies", hsCo.id, "deals");
      const deals = dealIds.length > 0 ? await batchReadDeals(accessToken, dealIds) : [];
      const pipeline = pickPipelineSignal(deals, closedStageIds, stageLabelById);

      const lastOwnerName = sig.latest?.ownerId
        ? formatOwnerName(ownerById.get(sig.latest.ownerId))
        : null;

      const { error } = await supabase
        .from("company_hubspot_signals")
        .upsert(
          {
            company_id: exporepoCompanyId,
            hubspot_company_id: hsCo.id,
            matched_domain: hsCo.domain,
            met_by_me: sig.metByMe,
            met_by_team: sig.metByTeam,
            in_pipeline: pipeline.inPipeline,
            last_engagement_at: sig.latest?.timestamp ?? null,
            last_engagement_owner_name: lastOwnerName,
            latest_open_deal_stage: pipeline.latestOpenDealStage,
            latest_open_deal_amount: pipeline.latestOpenDealAmount,
            synced_at: new Date().toISOString(),
          },
          { onConflict: "company_id" },
        );
      if (error) throw new Error(`upsert: ${error.message}`);

      signalsWritten++;
      if (sig.metByMe) metByMeCount++;
      if (sig.metByTeam) metByTeamCount++;
      if (pipeline.inPipeline) inPipelineCount++;
    } catch (err) {
      errors.push({
        companyId: exporepoCompanyId,
        hubspotCompanyId: hsCo.id,
        message: err instanceof Error ? err.message : String(err),
      });
    }
  }

  // Drop signal rows that weren't refreshed in this run (the matched-set
  // shrank). Keeps the UI consistent with HubSpot's current state.
  const { error: delErr } = await supabase
    .from("company_hubspot_signals")
    .delete()
    .lt("synced_at", syncStartIso);
  if (delErr) {
    errors.push({ message: `delete stale: ${delErr.message}` });
  }

  return {
    syncedAt: new Date().toISOString(),
    exporepoapiCompanies: companies.length,
    domainsResolved: domains.length,
    hubspotCompaniesMatched: hsCompanies.length,
    signalsWritten,
    metByMeCount,
    metByTeamCount,
    inPipelineCount,
    errors,
  };
}

async function loadExporepoCompanies(
  supabase: SupabaseClient,
): Promise<Array<{ id: string; website: string | null }>> {
  const PAGE_SIZE = 1000;
  const out: Array<{ id: string; website: string | null }> = [];
  let from = 0;
  for (;;) {
    const { data, error } = await supabase
      .from("companies")
      .select("id, website")
      .not("website", "is", null)
      .range(from, from + PAGE_SIZE - 1);
    if (error) throw new Error(`loadExporepoCompanies: ${error.message}`);
    const rows = (data ?? []) as Array<{ id: string; website: string | null }>;
    out.push(...rows);
    if (rows.length < PAGE_SIZE) break;
    from += PAGE_SIZE;
  }
  return out;
}
