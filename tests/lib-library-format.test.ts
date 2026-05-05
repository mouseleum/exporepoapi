import { describe, expect, it } from "vitest";
import { formatRevenue, formatRevenueUsd } from "../lib/library/format";

describe("formatRevenueUsd", () => {
  it("returns null for null/undefined/zero/negative/NaN", () => {
    expect(formatRevenueUsd(null)).toBeNull();
    expect(formatRevenueUsd(undefined)).toBeNull();
    expect(formatRevenueUsd(0)).toBeNull();
    expect(formatRevenueUsd(-5)).toBeNull();
    expect(formatRevenueUsd(Number.NaN)).toBeNull();
  });

  it("formats sub-millions as K", () => {
    expect(formatRevenueUsd(300)).toBe("$300");
    expect(formatRevenueUsd(1_500)).toBe("$2K");
    expect(formatRevenueUsd(900_000)).toBe("$900K");
  });

  it("formats millions with one decimal under 10M, integer at/above 10M", () => {
    expect(formatRevenueUsd(1_200_000)).toBe("$1.2M");
    expect(formatRevenueUsd(9_900_000)).toBe("$9.9M");
    expect(formatRevenueUsd(45_000_000)).toBe("$45M");
  });

  it("formats billions with one decimal under 10B, integer at/above 10B", () => {
    expect(formatRevenueUsd(1_200_000_000)).toBe("$1.2B");
    expect(formatRevenueUsd(15_000_000_000)).toBe("$15B");
  });

  it("strips trailing .0", () => {
    expect(formatRevenueUsd(2_000_000)).toBe("$2M");
    expect(formatRevenueUsd(3_000_000_000)).toBe("$3B");
  });
});

describe("formatRevenue", () => {
  it("prefers Apollo USD over PDL range", () => {
    expect(formatRevenue(1_200_000, "$1M-$10M")).toBe("$1.2M");
  });

  it("falls back to range when Apollo missing", () => {
    expect(formatRevenue(null, "$1M-$10M")).toBe("$1M-$10M");
    expect(formatRevenue(undefined, "$1M-$10M")).toBe("$1M-$10M");
  });

  it("returns null when neither is usable", () => {
    expect(formatRevenue(null, null)).toBeNull();
    expect(formatRevenue(null, "")).toBeNull();
    expect(formatRevenue(null, "   ")).toBeNull();
    expect(formatRevenue(0, null)).toBeNull();
  });
});
