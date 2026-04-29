"use client";

import { useRef, useState, type KeyboardEvent } from "react";
import {
  apiFetch,
  extractTextFromAnthropic,
} from "@/lib/api-client";
import { buildGuidePrompt } from "@/lib/prompts";
import { GuideObjectSchema } from "@/lib/schemas";
import type { GuideData, Status } from "@/lib/types";
import { StatusBox } from "@/components/StatusBox";
import { GuideCard } from "./GuideCard";

export function ListGuideTab() {
  const [url, setUrl] = useState("");
  const [guide, setGuide] = useState<GuideData | null>(null);
  const [status, setStatus] = useState<Status>({ kind: "idle" });
  const [isLoading, setIsLoading] = useState(false);
  const resultRef = useRef<HTMLDivElement>(null);

  const submit = async () => {
    const trimmed = url.trim();
    if (!trimmed) {
      setStatus({ kind: "error", message: "Please enter a URL." });
      return;
    }
    setIsLoading(true);
    setGuide(null);
    setStatus({ kind: "loading", message: "Analysing site with AI..." });
    try {
      const data = await apiFetch({
        model: "claude-sonnet-4-20250514",
        max_tokens: 1500,
        tools: [{ type: "web_search_20250305", name: "web_search" }],
        prompt: buildGuidePrompt(trimmed),
      });
      const responseText = extractTextFromAnthropic(data);
      const jsonMatch = responseText.match(/\{[\s\S]*\}/);
      if (!jsonMatch) throw new Error("Unexpected response format.");
      const parsed = GuideObjectSchema.parse(JSON.parse(jsonMatch[0]));
      setGuide({
        site_name: parsed.site_name,
        platform: parsed.platform,
        difficulty: parsed.difficulty,
        steps: parsed.steps,
        tip: parsed.tip ?? null,
      });
      setStatus({ kind: "idle" });
      requestAnimationFrame(() => {
        resultRef.current?.scrollIntoView({
          behavior: "smooth",
          block: "start",
        });
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setStatus({ kind: "error", message: "Error: " + message });
    } finally {
      setIsLoading(false);
    }
  };

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      void submit();
    }
  };

  return (
    <>
      <div className="guide-input-section">
        <div className="input-row">
          <input
            type="text"
            className="url-input"
            placeholder="https://windeurope.org/annual2026/exhibition/exhibitor-list/"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            onKeyDown={onKeyDown}
          />
          <button
            type="button"
            className="btn btn-primary"
            disabled={isLoading}
            onClick={() => {
              void submit();
            }}
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
            Generate
          </button>
        </div>
        <div className="hint">
          Works for any trade show, conference, or expo website
        </div>
      </div>

      <StatusBox status={status} />

      {guide && (
        <div ref={resultRef}>
          <GuideCard url={url} guide={guide} />
        </div>
      )}
    </>
  );
}
