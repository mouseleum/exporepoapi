"use client";

import { useState } from "react";
import { Header } from "@/components/Header";
import { TabBar, type TabId } from "@/components/TabBar";

export default function HomePage() {
  const [activeTab, setActiveTab] = useState<TabId>("ranker");

  return (
    <div className="wrap">
      <Header />
      <TabBar activeTab={activeTab} onTabChange={setActiveTab} />

      <div
        id="panel-ranker"
        className={`panel${activeTab === "ranker" ? " active" : ""}`}
      >
        <div className="hero">
          <h1>
            Find your top
            <br />
            <span className="hl-yellow">targets</span>
            <br />
            instantly.
          </h1>
          <p>
            Upload any trade show exhibitor list. AI scores every company by
            size, trade show frequency, and brand recognition — then exports a
            ready-to-use CSV.
          </p>
        </div>
        {/* RankerTab UI lands here in Step 4 */}
      </div>

      <div
        id="panel-guide"
        className={`panel${activeTab === "guide" ? " active" : ""}`}
      >
        <div className="hero">
          <h1>
            How to get
            <br />
            the <span className="hl-blue">exhibitor list</span>
          </h1>
          <p>
            Paste any trade show website URL. AI analyses the site and gives
            you exact step-by-step instructions to extract the exhibitor list —
            ready to drop into the Ranker.
          </p>
        </div>
        {/* ListGuideTab UI lands here in Step 5 */}
      </div>
    </div>
  );
}
