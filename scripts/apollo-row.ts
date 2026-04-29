export type ApolloCompanyInsert = {
  apollo_account_id: string;
  source: "apollo";
  name: string;
  name_normalized: string;
  name_for_emails: string | null;
  account_stage: string | null;
  lists: string | null;
  account_owner: string | null;
  industry: string | null;
  employees: number | null;
  founded_year: number | null;
  short_description: string | null;
  website: string | null;
  linkedin_url: string | null;
  facebook_url: string | null;
  twitter_url: string | null;
  logo_url: string | null;
  phone: string | null;
  street: string | null;
  city: string | null;
  state: string | null;
  country: string | null;
  postal_code: string | null;
  address: string | null;
  keywords: string[];
  technologies: string[];
  sic_codes: string[];
  naics_codes: string[];
  total_funding: number | null;
  latest_funding: string | null;
  latest_funding_amount: number | null;
  last_raised_at: string | null;
  annual_revenue: number | null;
  retail_locations: number | null;
  subsidiary_of: string | null;
  subsidiary_of_org_id: string | null;
  primary_intent_topic: string | null;
  primary_intent_score: number | null;
  secondary_intent_topic: string | null;
  secondary_intent_score: number | null;
  apollo_custom: Record<string, string>;
  updated_at: string;
};

const CUSTOM_HEADER_PREFIXES = [
  "Qualify Account",
  "Prerequisite:",
  "Exhibitor Likelihood",
];

function str(raw: Record<string, string>, key: string): string | null {
  const v = raw[key];
  if (v === undefined) return null;
  const trimmed = v.trim();
  return trimmed === "" ? null : trimmed;
}

function num(raw: Record<string, string>, key: string): number | null {
  const v = str(raw, key);
  if (v === null) return null;
  const cleaned = v.replace(/,/g, "");
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

function arr(raw: Record<string, string>, key: string): string[] {
  const v = raw[key];
  if (v === undefined) return [];
  return v
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

function date(raw: Record<string, string>, key: string): string | null {
  const v = str(raw, key);
  if (v === null) return null;
  if (!/^\d{4}-\d{2}-\d{2}/.test(v)) return null;
  return v.slice(0, 10);
}

export function normalizeName(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]/g, "");
}

export class MissingApolloIdError extends Error {
  constructor(public readonly rowName: string) {
    super(`Row missing apollo_account_id (name: ${rowName || "<unknown>"})`);
    this.name = "MissingApolloIdError";
  }
}

export function mapApolloRow(
  raw: Record<string, string>,
): ApolloCompanyInsert {
  const apollo_account_id = str(raw, "Apollo Account Id");
  const name = str(raw, "Company Name");
  if (!apollo_account_id) {
    throw new MissingApolloIdError(name ?? "");
  }
  if (!name) {
    throw new Error(
      `Row missing Company Name (apollo_account_id: ${apollo_account_id})`,
    );
  }

  const apollo_custom: Record<string, string> = {};
  for (const [key, value] of Object.entries(raw)) {
    if (!value || value.trim() === "") continue;
    if (CUSTOM_HEADER_PREFIXES.some((p) => key.startsWith(p))) {
      apollo_custom[key] = value.trim();
    }
  }

  return {
    apollo_account_id,
    source: "apollo",
    name,
    name_normalized: normalizeName(name),
    name_for_emails: str(raw, "Company Name for Emails"),
    account_stage: str(raw, "Account Stage"),
    lists: str(raw, "Lists"),
    account_owner: str(raw, "Account Owner"),

    industry: str(raw, "Industry"),
    employees: num(raw, "# Employees"),
    founded_year: num(raw, "Founded Year"),
    short_description: str(raw, "Short Description"),

    website: str(raw, "Website"),
    linkedin_url: str(raw, "Company Linkedin Url"),
    facebook_url: str(raw, "Facebook Url"),
    twitter_url: str(raw, "Twitter Url"),
    logo_url: str(raw, "Logo Url"),
    phone: str(raw, "Company Phone"),

    street: str(raw, "Company Street"),
    city: str(raw, "Company City"),
    state: str(raw, "Company State"),
    country: str(raw, "Company Country"),
    postal_code: str(raw, "Company Postal Code"),
    address: str(raw, "Company Address"),

    keywords: arr(raw, "Keywords"),
    technologies: arr(raw, "Technologies"),
    sic_codes: arr(raw, "SIC Codes"),
    naics_codes: arr(raw, "NAICS Codes"),

    total_funding: num(raw, "Total Funding"),
    latest_funding: str(raw, "Latest Funding"),
    latest_funding_amount: num(raw, "Latest Funding Amount"),
    last_raised_at: date(raw, "Last Raised At"),
    annual_revenue: num(raw, "Annual Revenue"),
    retail_locations: num(raw, "Number of Retail Locations"),

    subsidiary_of: str(raw, "Subsidiary of"),
    subsidiary_of_org_id: str(raw, "Subsidiary of (Organization ID)"),

    primary_intent_topic: str(raw, "Primary Intent Topic"),
    primary_intent_score: num(raw, "Primary Intent Score"),
    secondary_intent_topic: str(raw, "Secondary Intent Topic"),
    secondary_intent_score: num(raw, "Secondary Intent Score"),

    apollo_custom,
    updated_at: new Date().toISOString(),
  };
}
