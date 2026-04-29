import type { ParsedRow } from "./types";

export function parseCSV(text: string): ParsedRow[] {
  const lines = text.trim().split(/\r?\n/);
  if (!lines.length) return [];

  const firstLine = lines[0];
  if (!firstLine) return [];

  const delim =
    firstLine.split(";").length > firstLine.split(",").length ? ";" : ",";

  const splitRow = (line: string): string[] => {
    const fields: string[] = [];
    let current = "";
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line.charAt(i);
      if (inQuotes) {
        if (ch === '"') {
          if (i + 1 < line.length && line.charAt(i + 1) === '"') {
            current += '"';
            i++;
          } else {
            inQuotes = false;
          }
        } else {
          current += ch;
        }
      } else {
        if (ch === '"') {
          inQuotes = true;
        } else if (ch === delim) {
          fields.push(current.trim());
          current = "";
        } else {
          current += ch;
        }
      }
    }
    fields.push(current.trim());
    return fields;
  };

  const headers = splitRow(firstLine);
  return lines
    .slice(1)
    .filter((l) => l.trim())
    .map((line) => {
      const vals = splitRow(line);
      const obj: ParsedRow = {};
      headers.forEach((h, i) => {
        obj[h] = vals[i] ?? "";
      });
      return obj;
    });
}
