// Phase 9 (HubSpot): typed wrappers around the HubSpot CRM v3/v4 endpoints
// the sync orchestrator needs. Functional API; no class. Each function takes
// a bearer access token (callers obtain it via getValidAccessToken from
// ./auth.ts) and otherwise has no shared state.
//
// All calls go through `hubspotFetch` which retries 429s (respecting
// Retry-After) and transient 5xx with exponential backoff.

const HUBAPI = "https://api.hubapi.com";

export type HubSpotCompany = {
  id: string;
  domain: string | null;
  name: string | null;
};

export type HubSpotDeal = {
  id: string;
  dealstage: string | null;
  amount: number | null;
  pipeline: string | null;
};

export type HubSpotEngagementType = "meetings" | "calls" | "emails" | "notes";

export type HubSpotEngagement = {
  id: string;
  type: HubSpotEngagementType;
  ownerId: string | null;
  timestamp: string | null; // ISO
};

export type HubSpotOwner = {
  id: string;
  email: string | null;
  firstName: string | null;
  lastName: string | null;
};

export type DealStage = {
  id: string;
  label: string;
  pipelineId: string;
  closed: boolean;
};

const ENGAGEMENT_TIMESTAMP_PROP: Record<HubSpotEngagementType, string> = {
  meetings: "hs_meeting_start_time",
  calls: "hs_timestamp",
  emails: "hs_timestamp",
  notes: "hs_timestamp",
};

async function hubspotFetch(
  accessToken: string,
  url: string,
  init: RequestInit = {},
  attempt = 0,
): Promise<Response> {
  const res = await fetch(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
  });

  if (res.status === 429 && attempt < 4) {
    // Retry-After may be an HTTP-date (RFC 7231) — Number() then yields NaN,
    // which would propagate through Math.max/min and make sleep() return
    // immediately. Fall back to 1s rather than retrying with zero backoff.
    const retryAfter = Number(res.headers.get("retry-after") ?? "1");
    const seconds = Number.isFinite(retryAfter) ? retryAfter : 1;
    const delayMs = Math.max(1000, Math.min(20_000, seconds * 1000));
    await sleep(delayMs);
    return hubspotFetch(accessToken, url, init, attempt + 1);
  }
  if (res.status >= 500 && attempt < 3) {
    await sleep(500 * 2 ** attempt);
    return hubspotFetch(accessToken, url, init, attempt + 1);
  }
  return res;
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

async function readJsonOrThrow(res: Response, label: string): Promise<unknown> {
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`${label} ${res.status}: ${text.slice(0, 300)}`);
  }
  return res.json();
}

// ---- Companies (search by domain) ----

export async function searchCompaniesByDomain(
  accessToken: string,
  domains: string[],
): Promise<HubSpotCompany[]> {
  if (domains.length === 0) return [];
  const unique = Array.from(new Set(domains.map((d) => d.toLowerCase())));
  const out: HubSpotCompany[] = [];

  // HubSpot Search supports up to 100 values in an IN filter. Chunk and paginate.
  const CHUNK = 100;
  for (let i = 0; i < unique.length; i += CHUNK) {
    const chunk = unique.slice(i, i + CHUNK);
    let after: string | undefined;
    for (;;) {
      const body: Record<string, unknown> = {
        filterGroups: [
          {
            filters: [{ propertyName: "domain", operator: "IN", values: chunk }],
          },
        ],
        properties: ["domain", "name"],
        limit: 100,
      };
      if (after) body.after = after;
      const res = await hubspotFetch(
        accessToken,
        `${HUBAPI}/crm/v3/objects/companies/search`,
        { method: "POST", body: JSON.stringify(body) },
      );
      const data = (await readJsonOrThrow(res, "searchCompaniesByDomain")) as {
        results?: Array<{
          id: string;
          properties?: { domain?: string | null; name?: string | null };
        }>;
        paging?: { next?: { after?: string } };
      };
      for (const r of data.results ?? []) {
        out.push({
          id: r.id,
          domain: r.properties?.domain ?? null,
          name: r.properties?.name ?? null,
        });
      }
      after = data.paging?.next?.after;
      if (!after) break;
    }
  }
  return out;
}

// ---- Associations (v4) ----

export async function listAssociations(
  accessToken: string,
  fromType: string,
  fromId: string,
  toType: string,
): Promise<string[]> {
  const out: string[] = [];
  let after: string | undefined;
  for (;;) {
    const u = new URL(
      `${HUBAPI}/crm/v4/objects/${fromType}/${fromId}/associations/${toType}`,
    );
    if (after) u.searchParams.set("after", after);
    u.searchParams.set("limit", "100");
    const res = await hubspotFetch(accessToken, u.toString(), { method: "GET" });
    if (res.status === 404) return out;
    const data = (await readJsonOrThrow(res, `listAssociations ${fromType}->${toType}`)) as {
      results?: Array<{ toObjectId?: string | number; id?: string }>;
      paging?: { next?: { after?: string } };
    };
    for (const r of data.results ?? []) {
      const id = r.toObjectId ?? r.id;
      if (id != null) out.push(String(id));
    }
    after = data.paging?.next?.after;
    if (!after) break;
  }
  return out;
}

export async function batchListAssociationsFromContacts(
  accessToken: string,
  contactIds: string[],
  toType: HubSpotEngagementType,
): Promise<Map<string, string[]>> {
  const out = new Map<string, string[]>();
  if (contactIds.length === 0) return out;

  const CHUNK = 100;
  for (let i = 0; i < contactIds.length; i += CHUNK) {
    const chunk = contactIds.slice(i, i + CHUNK);
    const res = await hubspotFetch(
      accessToken,
      `${HUBAPI}/crm/v4/associations/contacts/${toType}/batch/read`,
      {
        method: "POST",
        body: JSON.stringify({ inputs: chunk.map((id) => ({ id })) }),
      },
    );
    if (res.status === 404) continue;
    const data = (await readJsonOrThrow(
      res,
      `batchListAssociationsFromContacts contacts->${toType}`,
    )) as {
      results?: Array<{
        from?: { id?: string };
        to?: Array<{ toObjectId?: string | number; id?: string }>;
      }>;
    };
    for (const r of data.results ?? []) {
      const fromId = r.from?.id;
      if (!fromId) continue;
      const list = (r.to ?? [])
        .map((t) => t.toObjectId ?? t.id)
        .filter((v): v is string | number => v != null)
        .map(String);
      out.set(fromId, list);
    }
  }
  return out;
}

// ---- Engagements (batch read) ----

export async function batchReadEngagements(
  accessToken: string,
  type: HubSpotEngagementType,
  ids: string[],
): Promise<HubSpotEngagement[]> {
  const out: HubSpotEngagement[] = [];
  if (ids.length === 0) return out;
  const tsProp = ENGAGEMENT_TIMESTAMP_PROP[type];

  const CHUNK = 100;
  for (let i = 0; i < ids.length; i += CHUNK) {
    const chunk = ids.slice(i, i + CHUNK);
    const res = await hubspotFetch(
      accessToken,
      `${HUBAPI}/crm/v3/objects/${type}/batch/read`,
      {
        method: "POST",
        body: JSON.stringify({
          properties: [tsProp, "hubspot_owner_id", "hs_createdate"],
          inputs: chunk.map((id) => ({ id })),
        }),
      },
    );
    const data = (await readJsonOrThrow(res, `batchReadEngagements ${type}`)) as {
      results?: Array<{
        id: string;
        properties?: Record<string, string | null | undefined>;
      }>;
    };
    for (const r of data.results ?? []) {
      const props = r.properties ?? {};
      out.push({
        id: r.id,
        type,
        ownerId: (props.hubspot_owner_id as string | null) ?? null,
        timestamp:
          (props[tsProp] as string | null | undefined) ??
          (props.hs_createdate as string | null | undefined) ??
          null,
      });
    }
  }
  return out;
}

// ---- Deals ----

export async function batchReadDeals(
  accessToken: string,
  ids: string[],
): Promise<HubSpotDeal[]> {
  const out: HubSpotDeal[] = [];
  if (ids.length === 0) return out;

  const CHUNK = 100;
  for (let i = 0; i < ids.length; i += CHUNK) {
    const chunk = ids.slice(i, i + CHUNK);
    const res = await hubspotFetch(
      accessToken,
      `${HUBAPI}/crm/v3/objects/deals/batch/read`,
      {
        method: "POST",
        body: JSON.stringify({
          properties: ["dealstage", "amount", "pipeline"],
          inputs: chunk.map((id) => ({ id })),
        }),
      },
    );
    const data = (await readJsonOrThrow(res, "batchReadDeals")) as {
      results?: Array<{
        id: string;
        properties?: { dealstage?: string | null; amount?: string | null; pipeline?: string | null };
      }>;
    };
    for (const r of data.results ?? []) {
      const a = r.properties?.amount;
      out.push({
        id: r.id,
        dealstage: r.properties?.dealstage ?? null,
        amount: a == null || a === "" ? null : Number(a),
        pipeline: r.properties?.pipeline ?? null,
      });
    }
  }
  return out;
}

// ---- Deal pipelines (for closed-stage detection) ----

export async function listDealStages(accessToken: string): Promise<DealStage[]> {
  const res = await hubspotFetch(
    accessToken,
    `${HUBAPI}/crm/v3/pipelines/deals`,
    { method: "GET" },
  );
  const data = (await readJsonOrThrow(res, "listDealStages")) as {
    results?: Array<{
      id: string;
      stages?: Array<{
        id: string;
        label: string;
        metadata?: { isClosed?: string | boolean };
      }>;
    }>;
  };
  const stages: DealStage[] = [];
  for (const p of data.results ?? []) {
    for (const s of p.stages ?? []) {
      const closedRaw = s.metadata?.isClosed;
      const closed = closedRaw === true || closedRaw === "true";
      stages.push({ id: s.id, label: s.label, pipelineId: p.id, closed });
    }
  }
  return stages;
}

// ---- Owners ----

export async function listOwners(accessToken: string): Promise<HubSpotOwner[]> {
  const out: HubSpotOwner[] = [];
  let after: string | undefined;
  for (;;) {
    const u = new URL(`${HUBAPI}/crm/v3/owners/`);
    u.searchParams.set("limit", "100");
    if (after) u.searchParams.set("after", after);
    const res = await hubspotFetch(accessToken, u.toString(), { method: "GET" });
    const data = (await readJsonOrThrow(res, "listOwners")) as {
      results?: Array<{
        id: string;
        email?: string | null;
        firstName?: string | null;
        lastName?: string | null;
      }>;
      paging?: { next?: { after?: string } };
    };
    for (const r of data.results ?? []) {
      out.push({
        id: r.id,
        email: r.email ?? null,
        firstName: r.firstName ?? null,
        lastName: r.lastName ?? null,
      });
    }
    after = data.paging?.next?.after;
    if (!after) break;
  }
  return out;
}

export function formatOwnerName(owner: HubSpotOwner | undefined): string | null {
  if (!owner) return null;
  const name = [owner.firstName, owner.lastName].filter(Boolean).join(" ").trim();
  if (name) return name;
  return owner.email ?? null;
}
