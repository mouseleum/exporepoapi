"use client";

type TargetCountSliderProps = {
  value: number;
  onChange: (n: number) => void;
};

export function TargetCountSlider({ value, onChange }: TargetCountSliderProps) {
  return (
    <div className="target-row">
      <label htmlFor="target-count" className="target-label">
        Top targets
      </label>
      <input
        id="target-count"
        type="range"
        min={10}
        max={100}
        step={5}
        value={value}
        onChange={(e) => onChange(parseInt(e.target.value, 10))}
        className="target-input"
      />
      <span className="target-val">{value}</span>
    </div>
  );
}
