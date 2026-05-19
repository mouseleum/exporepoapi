import type { LibraryExhibitor, TagValue } from "./queries";
import { csvEscape } from "../csv-escape";
import { formatRevenueUsd } from "./format";

const HEADERS = [
  "Name",
  "Country",
  "Hall",
  "Booth",
  "Employees",
  "Revenue",
  "Industry",
  "Source",
  "Tag",
] as const;

function sourceLabel(row: LibraryExhibitor): string {
  if (row.source === "manual") return "manual";
  if (row.apollo_matched) return "enriched";
  return "";
}

function tagLabel(t: TagValue | null): string {
  return t ?? "";
}

export function buildExhibitorsCsv(rows: LibraryExhibitor[]): string {
  const header = HEADERS.join(",") + "\n";
  const body = rows
    .map((r) =>
      [
        `"${csvEscape(r.raw_name)}"`,
        `"${csvEscape(r.country)}"`,
        `"${csvEscape(r.hall)}"`,
        `"${csvEscape(r.booth ?? "")}"`,
        `"${csvEscape(r.employees)}"`,
        `"${csvEscape(formatRevenueUsd(r.annual_revenue) ?? "")}"`,
        `"${csvEscape(r.industry ?? "")}"`,
        `"${csvEscape(sourceLabel(r))}"`,
        `"${csvEscape(tagLabel(r.tag))}"`,
      ].join(","),
    )
    .join("\n");
  return header + body + (body ? "\n" : "");
}
