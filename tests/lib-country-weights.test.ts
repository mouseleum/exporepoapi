import { describe, it, expect } from "vitest";
import { buildCountryWeightDirective } from "@/lib/country-weights";

describe("buildCountryWeightDirective", () => {
  it("returns empty string when all weights are 50", () => {
    expect(buildCountryWeightDirective({ US: 50, DE: 50 })).toBe("");
  });

  it("returns empty string for an empty weights object", () => {
    expect(buildCountryWeightDirective({})).toBe("");
  });

  it("returns empty string for values inside the neutral 40–60 band", () => {
    expect(buildCountryWeightDirective({ US: 40, DE: 60 })).toBe("");
  });

  it("emits STRONGLY deprioritize for values below 20", () => {
    const out = buildCountryWeightDirective({ US: 10 });
    expect(out).toContain("STRONGLY deprioritize companies from US");
  });

  it("emits Deprioritize for values in [20, 40)", () => {
    const out = buildCountryWeightDirective({ US: 30 });
    expect(out).toContain("Deprioritize companies from US");
    expect(out).not.toContain("STRONGLY");
  });

  it("emits Prioritize for values in (60, 80]", () => {
    const out = buildCountryWeightDirective({ US: 70 });
    expect(out).toContain("Prioritize companies from US");
    expect(out).not.toContain("STRONGLY");
  });

  it("emits STRONGLY prioritize for values above 80", () => {
    const out = buildCountryWeightDirective({ US: 95 });
    expect(out).toContain("STRONGLY prioritize companies from US");
  });

  it("starts with the country preferences prefix and bullets", () => {
    const out = buildCountryWeightDirective({ US: 10, DE: 95 });
    expect(out.startsWith("\n\nCountry preferences (apply these adjustments):\n"))
      .toBe(true);
    const bullets = out.split("\n").filter((l) => l.startsWith("- "));
    expect(bullets).toHaveLength(2);
  });

  it("preserves insertion order across countries", () => {
    const out = buildCountryWeightDirective({ US: 10, DE: 95 });
    const usIdx = out.indexOf("from US");
    const deIdx = out.indexOf("from DE");
    expect(usIdx).toBeGreaterThan(-1);
    expect(deIdx).toBeGreaterThan(usIdx);
  });

  it("treats boundary 40 as neutral and 39 as deprioritize", () => {
    expect(buildCountryWeightDirective({ US: 40 })).toBe("");
    expect(buildCountryWeightDirective({ US: 39 })).toContain("Deprioritize");
  });

  it("treats boundary 60 as neutral and 61 as prioritize", () => {
    expect(buildCountryWeightDirective({ US: 60 })).toBe("");
    expect(buildCountryWeightDirective({ US: 61 })).toContain("Prioritize");
  });
});
