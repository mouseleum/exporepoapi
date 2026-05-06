"use client";

type ActionButtonsProps = {
  isScoring: boolean;
  onScore: () => void;
};

export function ActionButtons({ isScoring, onScore }: ActionButtonsProps) {
  return (
    <button
      type="button"
      className="btn btn-primary"
      disabled={isScoring}
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
  );
}
