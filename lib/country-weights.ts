import type { CountryWeights } from "./types";

export function buildCountryWeightDirective(weights: CountryWeights): string {
  const directives: string[] = [];
  for (const [country, val] of Object.entries(weights)) {
    if (val === 50) continue;
    if (val < 20) {
      directives.push(
        `STRONGLY deprioritize companies from ${country} — avoid including them unless they are top global brands`,
      );
    } else if (val < 40) {
      directives.push(
        `Deprioritize companies from ${country} — include fewer of them`,
      );
    } else if (val > 80) {
      directives.push(
        `STRONGLY prioritize companies from ${country} — boost their scores significantly`,
      );
    } else if (val > 60) {
      directives.push(
        `Prioritize companies from ${country} — give them a moderate score boost`,
      );
    }
  }
  if (!directives.length) return "";
  return (
    "\n\nCountry preferences (apply these adjustments):\n" +
    directives.map((d) => "- " + d).join("\n")
  );
}
