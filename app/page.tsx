"use client";

import { Header } from "@/components/Header";
import { TopNav } from "@/components/TopNav";
import { RankerTab } from "@/components/ranker/RankerTab";

export default function HomePage() {
  return (
    <div className="wrap">
      <Header />
      <TopNav />

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
      <RankerTab />
    </div>
  );
}
