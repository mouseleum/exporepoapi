// ISO 3166-1 alpha-2 ↔ full country name helpers.
// Ported from the standalone company-db-agent — used to normalize
// Apollo's full-name country strings to ISO codes so the rest of the
// app sees one consistent format.

export const ISO_TO_NAME: Record<string, string> = {
  AD: "Andorra", AF: "Afghanistan", AL: "Albania", DZ: "Algeria", AO: "Angola",
  AR: "Argentina", AM: "Armenia", AU: "Australia", AT: "Austria", AZ: "Azerbaijan",
  BH: "Bahrain", BD: "Bangladesh", BY: "Belarus", BE: "Belgium", BJ: "Benin",
  BO: "Bolivia", BA: "Bosnia and Herzegovina", BW: "Botswana", BR: "Brazil",
  BG: "Bulgaria", BF: "Burkina Faso", CM: "Cameroon", CA: "Canada", CL: "Chile",
  CN: "China", CO: "Colombia", CG: "Congo", CD: "Democratic Republic of the Congo",
  CR: "Costa Rica", CI: "Côte d'Ivoire", HR: "Croatia", CY: "Cyprus",
  CZ: "Czech Republic", DK: "Denmark", DO: "Dominican Republic", EC: "Ecuador",
  EG: "Egypt", SV: "El Salvador", EE: "Estonia", SZ: "Eswatini", ET: "Ethiopia",
  FI: "Finland", FR: "France", GE: "Georgia", DE: "Germany", GH: "Ghana",
  GR: "Greece", GT: "Guatemala", GN: "Guinea", HN: "Honduras", HK: "Hong Kong",
  HU: "Hungary", IS: "Iceland", IN: "India", ID: "Indonesia", IR: "Iran",
  IQ: "Iraq", IE: "Ireland", IL: "Israel", IT: "Italy", JM: "Jamaica",
  JP: "Japan", JO: "Jordan", KZ: "Kazakhstan", KE: "Kenya", XK: "Kosovo",
  KW: "Kuwait", LV: "Latvia", LB: "Lebanon", LI: "Liechtenstein", LY: "Libya",
  LT: "Lithuania", LU: "Luxembourg", MO: "Macao", MG: "Madagascar", MY: "Malaysia",
  ML: "Mali", MT: "Malta", MU: "Mauritius", MX: "Mexico", MD: "Moldova",
  MC: "Monaco", ME: "Montenegro", MA: "Morocco", MZ: "Mozambique", NA: "Namibia",
  NL: "Netherlands", NZ: "New Zealand", NG: "Nigeria", MK: "North Macedonia",
  NO: "Norway", OM: "Oman", PK: "Pakistan", PA: "Panama", PE: "Peru",
  PH: "Philippines", PL: "Poland", PT: "Portugal", PR: "Puerto Rico", QA: "Qatar",
  RO: "Romania", RU: "Russia", RW: "Rwanda", SM: "San Marino", SA: "Saudi Arabia",
  SN: "Senegal", RS: "Serbia", SG: "Singapore", SK: "Slovakia", SI: "Slovenia",
  ZA: "South Africa", KR: "South Korea", ES: "Spain", LK: "Sri Lanka", SE: "Sweden",
  CH: "Switzerland", SY: "Syria", TW: "Taiwan", TZ: "Tanzania", TH: "Thailand",
  TN: "Tunisia", TR: "Turkey", UG: "Uganda", UA: "Ukraine", AE: "United Arab Emirates",
  GB: "United Kingdom", US: "United States", UY: "Uruguay", UZ: "Uzbekistan",
  VE: "Venezuela", VN: "Vietnam", ZM: "Zambia", ZW: "Zimbabwe",
};

const NAME_TO_ISO: Record<string, string> = {};
for (const [iso, name] of Object.entries(ISO_TO_NAME)) {
  NAME_TO_ISO[name.toLowerCase()] = iso;
}
// Common aliases not covered by the canonical name.
Object.assign(NAME_TO_ISO, {
  usa: "US",
  "u.s.a": "US",
  "u.s.a.": "US",
  "united states of america": "US",
  america: "US",
  uk: "GB",
  "u.k.": "GB",
  "great britain": "GB",
  britain: "GB",
  england: "GB",
  scotland: "GB",
  wales: "GB",
  "northern ireland": "GB",
  deutschland: "DE",
  holland: "NL",
  "the netherlands": "NL",
  czechia: "CZ",
  korea: "KR",
  "republic of korea": "KR",
  "south-korea": "KR",
  "republic of china": "TW",
  "taiwan (chinese taipei)": "TW",
  "russian federation": "RU",
  "viet nam": "VN",
  "cote d'ivoire": "CI",
  "ivory coast": "CI",
  uae: "AE",
  tuerkiye: "TR",
  türkiye: "TR",
  turkiye: "TR",
  "republic of türkiye": "TR",
  swaziland: "SZ",
  "macedonia (fyrom)": "MK",
  "fyrom": "MK",
  "republic of macedonia": "MK",
  "republic of the congo": "CG",
  "democratic republic of the congo": "CD",
  "dr congo": "CD",
});

export function toISO(input: string | null | undefined): string | null {
  if (!input) return null;
  const trimmed = input.trim();
  if (!trimmed) return null;
  const up = trimmed.toUpperCase();
  if (ISO_TO_NAME[up]) return up;
  return NAME_TO_ISO[trimmed.toLowerCase()] ?? null;
}

export function toFullName(input: string | null | undefined): string | null {
  if (!input) return null;
  const iso = toISO(input);
  if (iso) return ISO_TO_NAME[iso] ?? input;
  return input.trim().replace(/\w\S*/g, (w) => w[0]!.toUpperCase() + w.slice(1).toLowerCase());
}
