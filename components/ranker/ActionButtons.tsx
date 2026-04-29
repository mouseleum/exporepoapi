"use client";

type ActionButtonsProps = {
  isScoring: boolean;
  isSaving: boolean;
  onScore: () => void;
  onSave: () => void;
};

export function ActionButtons({
  isScoring,
  isSaving,
  onScore,
  onSave,
}: ActionButtonsProps) {
  const disabled = isScoring || isSaving;
  return (
    <>
      <button
        type="button"
        className="btn btn-primary"
        disabled={disabled}
        onClick={onScore}
      >
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
        >
          <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
        </svg>
        Score with AI
      </button>
      <button
        type="button"
        className="btn"
        disabled={disabled}
        onClick={onSave}
        style={{
          borderColor: "var(--color-accent-blue)",
          color: "var(--color-accent-blue)",
          marginLeft: 8,
        }}
      >
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
        >
          <ellipse cx="12" cy="5" rx="9" ry="3" />
          <path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3" />
          <path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5" />
        </svg>
        Save to DB only
      </button>
    </>
  );
}
