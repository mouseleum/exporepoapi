// Escapes a single CSV field value. Callers wrap the result in literal
// quotes themselves (e.g. `"${csvEscape(name)}"`), so this function only
// needs to handle the contents-of-a-quoted-string rules:
//   - Empty / null / undefined → "" (callers wrap → "")
//   - Internal double quotes → doubled ("")
//   - Leading =, +, -, @ → prefixed with single quote to neutralize
//     Excel/Sheets formula execution on import (CSV-injection mitigation)
//
// Commas and newlines are safe because the caller is already wrapping in
// quotes; doubled quotes inside the field keep the parser happy.
export function csvEscape(
  v: string | number | null | undefined,
): string {
  if (v === null || v === undefined) return "";
  const s = String(v);
  const safe = /^[=+\-@]/.test(s) ? "'" + s : s;
  return safe.replace(/"/g, '""');
}
