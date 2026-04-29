import type { ParsedRow } from "./types";

export async function parseSpreadsheet(
  buffer: ArrayBuffer,
): Promise<ParsedRow[]> {
  const XLSX = await import("xlsx");
  const wb = XLSX.read(buffer, { type: "array", raw: false });
  const firstSheetName = wb.SheetNames[0];
  if (!firstSheetName) return [];
  const ws = wb.Sheets[firstSheetName];
  if (!ws) return [];
  return XLSX.utils.sheet_to_json<ParsedRow>(ws, { defval: "", raw: false });
}
