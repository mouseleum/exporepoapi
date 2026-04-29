"use client";

import type { GuideData } from "@/lib/types";

type GuideCardProps = {
  url: string;
  guide: GuideData;
};

function difficultyColor(diff: string): string {
  if (diff === "Easy") return "#4dff91";
  if (diff === "Medium") return "#ffb547";
  return "#ff5c5c";
}

function renderStepDescription(text: string): React.ReactNode {
  const parts = text.split(/(`[^`]+`)/g);
  return parts.map((part, i) => {
    if (part.startsWith("`") && part.endsWith("`")) {
      return <code key={i}>{part.slice(1, -1)}</code>;
    }
    return <span key={i}>{part}</span>;
  });
}

export function GuideCard({ url, guide }: GuideCardProps) {
  const diff = guide.difficulty || "Unknown";
  const color = difficultyColor(diff);
  return (
    <div className="guide-result">
      <div className="result-card">
        <div className="result-header">
          <span className="result-label">Step-by-step guide</span>
          <span className="result-site">{guide.site_name || url}</span>
        </div>
        <div className="result-body">
          <div className="guide-meta">
            {guide.platform && (
              <span
                style={{
                  fontFamily: "var(--font-mono)",
                  fontSize: 11,
                  background: "rgba(56,182,255,0.1)",
                  border: "1px solid rgba(56,182,255,0.2)",
                  color: "#38b6ff",
                  padding: "4px 10px",
                  borderRadius: 20,
                }}
              >
                {guide.platform}
              </span>
            )}
            <span
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: 11,
                border: `1px solid ${color}55`,
                color,
                padding: "4px 10px",
                borderRadius: 20,
              }}
            >
              {diff} difficulty
            </span>
          </div>
          <div className="steps">
            {guide.steps.map((step, i) => (
              <div key={i} className="step">
                <div className="step-num">{i + 1}</div>
                <div>
                  <div className="step-title">{step.title}</div>
                  <div className="step-desc">
                    {renderStepDescription(step.description)}
                  </div>
                </div>
              </div>
            ))}
          </div>
          {guide.tip && (
            <div className="tip-box">
              <strong>Tip:</strong> {guide.tip}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
