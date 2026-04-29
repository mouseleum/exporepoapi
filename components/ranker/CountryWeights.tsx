"use client";

import { useMemo } from "react";
import type { CountryWeights as CountryWeightsType, ParsedRow } from "@/lib/types";

type CountryWeightsProps = {
  rows: ParsedRow[];
  countryColumn: string;
  weights: CountryWeightsType;
  onChange: (weights: CountryWeightsType) => void;
};

export function CountryWeights({
  rows,
  countryColumn,
  weights,
  onChange,
}: CountryWeightsProps) {
  const top = useMemo(() => {
    if (!countryColumn || !rows.length) return [] as [string, number][];
    const counts: Record<string, number> = {};
    for (const r of rows) {
      const val = String(r[countryColumn] ?? "").trim().toUpperCase();
      if (val) counts[val] = (counts[val] ?? 0) + 1;
    }
    return Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10);
  }, [rows, countryColumn]);

  if (!top.length) return null;

  return (
    <div className="country-weights">
      <div className="country-weights-title">Country weight</div>
      <div>
        {top.map(([code, count]) => {
          const value = weights[code] ?? 50;
          return (
            <div key={code} className="country-slider-row">
              <span className="country-slider-code">{code}</span>
              <span className="country-slider-count">({count})</span>
              <input
                type="range"
                min={0}
                max={100}
                value={value}
                className="country-slider-input"
                onChange={(e) =>
                  onChange({
                    ...weights,
                    [code]: parseInt(e.target.value, 10),
                  })
                }
              />
              <span className="country-slider-val">{value}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
