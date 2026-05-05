export type ParsedRow = Record<string, string>;

export type ColumnSelection = {
  name: string;
  country: string;
  hall: string;
};

export type CountryWeights = Record<string, number>;

export type RankedRow = {
  rank: number;
  name: string;
  country: string;
  hall: string;
  score: number;
  employees: number | null;
  industry: string | null;
  revenue: string | null;
};

export type EnrichedCompany =
  | {
      name: string;
      matched: true;
      employee_count: number | null;
      employee_range: string | null;
      industry: string | null;
      revenue_range: string | null;
      founded: number | null;
      linkedin_url: string | null;
      tags: string[];
    }
  | { name: string; matched: false };

export type GuideStep = { title: string; description: string };

export type GuideData = {
  site_name: string;
  platform: string;
  difficulty: string;
  steps: GuideStep[];
  tip: string | null;
};

export type CompanyDbEntry = {
  normalized: string;
  raw: string[];
  country: string | null;
};

export type CompanyDbCache = {
  byRaw: Map<string, CompanyDbEntry>;
  byNormalized: Map<string, CompanyDbEntry>;
};

export type StatusKind = "idle" | "loading" | "info" | "error";

export type Status =
  | { kind: "idle" }
  | { kind: "loading"; message: string }
  | { kind: "info"; message: string }
  | { kind: "error"; message: string };
