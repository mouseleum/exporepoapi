import { z } from "zod";
import type { Adapter, EventMeta, RawExhibitor, RawPerson } from "./types";

export const SwapcardConfigSchema = z.object({
  viewId: z.string().min(1),
  eventId: z.string().min(1),
  persistedQueryHash: z.string().min(1).optional(),
  peopleQueryHash: z.string().min(1).optional(),
  endpoint: z.string().url().optional(),
  pageSize: z.number().int().positive().optional(),
  minExhibitors: z.number().int().nonnegative().optional(),
  clientOrigin: z.string().min(1).optional(),
  clientVersion: z.string().min(1).optional(),
});
export type SwapcardConfig = z.infer<typeof SwapcardConfigSchema>;

// Captured 2026-05-16 from visitor.vitafoodsglobal.com (Vitafoods Europe 2026).
// If Swapcard ships a new app build the GraphQL document hash changes and the
// server returns PersistedQueryNotFound — capture the new hash from the DevTools
// Network panel (operationName=EventExhibitorListViewConnectionQuery) and pass
// it via adapter_config.persistedQueryHash.
const DEFAULT_PERSISTED_QUERY_HASH =
  "b3cb76208b6de3d96c5ba1a8f02e6be6135d5ff1db0a2eecd64b7d15e7e6b5e2";

// EventExhibitorDetailsViewQuery hash, captured 2026-05-17 from
// attendees.toc-go.com (TOC Europe 2026). Returns the exhibitor object plus
// a paginated `members` connection (Core_EventPerson with firstName, lastName,
// jobTitle, organization, photoUrl). Same caveat about hash rotation applies.
const DEFAULT_PEOPLE_QUERY_HASH =
  "fe9f995a579b65a3453f7f576cd37bea71539cf7cf12ed9e59eb2a41706c9630";

const DEFAULT_ENDPOINT = "https://api.swapcard.com/graphql";
const DEFAULT_CLIENT_ORIGIN = "visitor.vitafoodsglobal.com";
const DEFAULT_CLIENT_VERSION = "2.310.80";
const MAX_PAGES = 100;
const PEOPLE_CONCURRENCY = 5;

const USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36";

type ExhibitorNode = {
  id?: string;
  name?: string;
  withEvent?: { booth?: string | null } | null;
};

type ExhibitorsConnection = {
  nodes?: ExhibitorNode[];
  pageInfo?: { hasNextPage?: boolean; endCursor?: string | null };
  totalCount?: number;
};

type GraphQLResponse = {
  data?: { view?: { exhibitors?: ExhibitorsConnection } };
  errors?: Array<{ message?: string; extensions?: { code?: string } }>;
};

export function parseNodes(nodes: ExhibitorNode[]): RawExhibitor[] {
  const out: RawExhibitor[] = [];
  const seen = new Set<string>();
  for (const n of nodes) {
    const name = (n.name ?? "").trim();
    if (!name) continue;
    const key = name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    const booth = (n.withEvent?.booth ?? "").trim() || null;
    out.push({
      raw_name: name,
      country: null,
      hall: null,
      booth,
      source_id: n.id ?? null,
    });
  }
  return out;
}

type PersonNode = {
  id?: string;
  firstName?: string | null;
  lastName?: string | null;
  jobTitle?: string | null;
  organization?: string | null;
  photoUrl?: string | null;
};

export function parsePeople(
  exhibitorSourceId: string,
  nodes: PersonNode[],
): RawPerson[] {
  const out: RawPerson[] = [];
  for (const n of nodes) {
    const first = (n.firstName ?? "").trim();
    const last = (n.lastName ?? "").trim();
    const name = [first, last].filter(Boolean).join(" ").trim();
    if (!name) continue;
    out.push({
      source_exhibitor_id: exhibitorSourceId,
      source_person_id: n.id ?? null,
      raw_name: name,
      first_name: first || null,
      last_name: last || null,
      job_title: (n.jobTitle ?? "").trim() || null,
      organization: (n.organization ?? "").trim() || null,
      photo_url: n.photoUrl || null,
    });
  }
  return out;
}

export function swapcardFactory(meta: EventMeta, config: unknown): Adapter {
  const parsed = SwapcardConfigSchema.parse(config);
  const hash = parsed.persistedQueryHash ?? DEFAULT_PERSISTED_QUERY_HASH;
  const peopleHash = parsed.peopleQueryHash ?? DEFAULT_PEOPLE_QUERY_HASH;
  const endpoint = parsed.endpoint ?? DEFAULT_ENDPOINT;
  const minExhibitors = parsed.minExhibitors ?? 50;
  const clientOrigin = parsed.clientOrigin ?? DEFAULT_CLIENT_ORIGIN;
  const clientVersion = parsed.clientVersion ?? DEFAULT_CLIENT_VERSION;

  async function fetchPage(
    endCursor: string | null,
  ): Promise<ExhibitorsConnection> {
    const variables: Record<string, unknown> = {
      withEvent: true,
      viewId: parsed.viewId,
      eventId: parsed.eventId,
    };
    if (endCursor) variables.endCursor = endCursor;

    const body = [
      {
        operationName: "EventExhibitorListViewConnectionQuery",
        variables,
        extensions: {
          persistedQuery: { version: 1, sha256Hash: hash },
        },
      },
    ];

    const res = await fetch(endpoint, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        accept: "*/*",
        "user-agent": USER_AGENT,
        "x-client-origin": clientOrigin,
        "x-client-version": clientVersion,
        "x-client-platform": "Event App",
        "x-content-language": "en_US",
      },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      throw new Error(
        `swapcard fetch failed: ${res.status} (${meta.slug}, cursor=${endCursor ?? "<start>"})`,
      );
    }
    const text = await res.text();
    if (!text.trim().startsWith("[") && !text.trim().startsWith("{")) {
      throw new Error(
        `swapcard returned non-JSON body (likely bot challenge); first chars: ${text.slice(0, 80)}`,
      );
    }
    const payload = JSON.parse(text) as GraphQLResponse | GraphQLResponse[];
    const entry = Array.isArray(payload) ? payload[0] : payload;
    if (!entry) throw new Error("swapcard returned empty payload");
    if (entry.errors?.length) {
      const code = entry.errors[0]?.extensions?.code;
      const msg = entry.errors[0]?.message ?? "unknown";
      if (code === "PERSISTED_QUERY_NOT_FOUND") {
        throw new Error(
          `swapcard persisted query hash rejected — capture a fresh sha256Hash from DevTools (operation=EventExhibitorListViewConnectionQuery) and update adapter_config.persistedQueryHash`,
        );
      }
      throw new Error(`swapcard GraphQL error: ${code ?? ""} ${msg}`);
    }
    const conn = entry.data?.view?.exhibitors;
    if (!conn) {
      throw new Error("swapcard response missing data.view.exhibitors");
    }
    return conn;
  }

  async function fetchExhibitors(): Promise<RawExhibitor[]> {
    const seen = new Set<string>();
    const out: RawExhibitor[] = [];
    let cursor: string | null = null;
    let pages = 0;
    while (pages < MAX_PAGES) {
      const conn = await fetchPage(cursor);
      pages++;
      for (const row of parseNodes(conn.nodes ?? [])) {
        const key = row.raw_name.toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);
        out.push(row);
      }
      const next = conn.pageInfo?.endCursor ?? null;
      if (!conn.pageInfo?.hasNextPage || !next || next === cursor) break;
      cursor = next;
    }
    if (pages >= MAX_PAGES) {
      throw new Error(
        `swapcard pagination exceeded ${MAX_PAGES} pages (${out.length} so far) — page size may have shrunk or hasNextPage stuck true`,
      );
    }
    if (out.length < minExhibitors) {
      throw new Error(
        `swapcard returned only ${out.length} exhibitors (min=${minExhibitors}); query shape or hash may have changed`,
      );
    }
    return out;
  }

  async function fetchPeopleForExhibitor(
    exhibitorSourceId: string,
  ): Promise<RawPerson[]> {
    const body = [
      {
        operationName: "EventExhibitorDetailsViewQuery",
        variables: {
          withEvent: true,
          skipMeetings: true,
          selfUserId: "",
          withSelfMember: false,
          exhibitorId: exhibitorSourceId,
          eventId: parsed.eventId,
        },
        extensions: {
          persistedQuery: { version: 1, sha256Hash: peopleHash },
        },
      },
    ];
    const res = await fetch(endpoint, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        accept: "*/*",
        "user-agent": USER_AGENT,
        "x-client-origin": clientOrigin,
        "x-client-version": clientVersion,
        "x-client-platform": "Event App",
        "x-content-language": "en_US",
      },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      throw new Error(
        `swapcard people fetch failed: ${res.status} (exhibitor=${exhibitorSourceId})`,
      );
    }
    const text = await res.text();
    if (!text.trim().startsWith("[") && !text.trim().startsWith("{")) {
      throw new Error(
        `swapcard people returned non-JSON body; first chars: ${text.slice(0, 80)}`,
      );
    }
    const payload = JSON.parse(text) as unknown;
    const entry = Array.isArray(payload) ? payload[0] : payload;
    const errors = (entry as { errors?: Array<{ extensions?: { code?: string }; message?: string }> })?.errors;
    if (errors?.length) {
      const code = errors[0]?.extensions?.code;
      if (code === "PERSISTED_QUERY_NOT_FOUND") {
        throw new Error(
          `swapcard people query hash rejected — capture a fresh sha256Hash from DevTools (operation=EventExhibitorDetailsViewQuery) and update adapter_config.peopleQueryHash`,
        );
      }
      throw new Error(`swapcard people GraphQL error: ${code ?? ""} ${errors[0]?.message ?? ""}`);
    }
    const data = (entry as { data?: { members?: { nodes?: PersonNode[] } } })?.data;
    return parsePeople(exhibitorSourceId, data?.members?.nodes ?? []);
  }

  async function fetchPeople(
    exhibitorSourceIds: string[],
  ): Promise<RawPerson[]> {
    const ids = exhibitorSourceIds.filter((id) => id);
    if (ids.length === 0) return [];
    const out: RawPerson[] = [];
    let cursor = 0;
    async function worker() {
      while (true) {
        const i = cursor++;
        if (i >= ids.length) return;
        const id = ids[i];
        if (!id) continue;
        const people = await fetchPeopleForExhibitor(id);
        out.push(...people);
      }
    }
    await Promise.all(
      Array.from({ length: Math.min(PEOPLE_CONCURRENCY, ids.length) }, worker),
    );
    return out;
  }

  return { meta, fetch: fetchExhibitors, fetchPeople };
}
