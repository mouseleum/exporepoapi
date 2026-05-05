export function formatRevenueUsd(n: number | null | undefined): string | null {
  if (n == null || !Number.isFinite(n) || n <= 0) return null;
  if (n >= 1_000_000_000) {
    return `$${(n / 1_000_000_000).toFixed(n >= 10_000_000_000 ? 0 : 1).replace(/\.0$/, "")}B`;
  }
  if (n >= 1_000_000) {
    return `$${(n / 1_000_000).toFixed(n >= 10_000_000 ? 0 : 1).replace(/\.0$/, "")}M`;
  }
  if (n >= 1_000) {
    return `$${(n / 1_000).toFixed(0)}K`;
  }
  return `$${n}`;
}

export function formatRevenue(
  annualRevenue: number | null | undefined,
  range: string | null | undefined,
): string | null {
  return formatRevenueUsd(annualRevenue) ?? (range && range.trim() ? range : null);
}
