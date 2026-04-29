export type TabId = "ranker" | "guide";

type TabBarProps = {
  activeTab: TabId;
  onTabChange: (tab: TabId) => void;
};

export function TabBar({ activeTab, onTabChange }: TabBarProps) {
  return (
    <div className="tab-nav">
      <button
        type="button"
        className={`tab-btn${activeTab === "ranker" ? " active" : ""}`}
        onClick={() => onTabChange("ranker")}
      >
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
        >
          <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
        </svg>
        <span>Exhibitor Ranker</span>
      </button>
      <button
        type="button"
        className={`tab-btn${activeTab === "guide" ? " active" : ""}`}
        onClick={() => onTabChange("guide")}
      >
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
        >
          <circle cx="11" cy="11" r="8" />
          <path d="m21 21-4.35-4.35" />
        </svg>
        <span>List Guide</span>
      </button>
    </div>
  );
}
