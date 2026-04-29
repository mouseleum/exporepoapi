import { describe, it, expect } from "vitest";
import { chunkText } from "@/lib/pdf";

describe("chunkText", () => {
  it("returns a single chunk when text is shorter than chunkSize", () => {
    const text = "hello world";
    expect(chunkText(text, 12000, 500)).toEqual(["hello world"]);
  });

  it("returns a single chunk when text length equals chunkSize exactly", () => {
    const text = "x".repeat(12000);
    const chunks = chunkText(text, 12000, 500);
    expect(chunks).toHaveLength(1);
    expect(chunks[0]).toBe(text);
  });

  it("emits exactly two chunks when text is one char over chunkSize", () => {
    const text = "x".repeat(12001);
    const chunks = chunkText(text, 12000, 500);
    expect(chunks).toHaveLength(2);
    expect(chunks[0]?.length).toBe(12000);
    expect(chunks[1]?.length).toBe(12001 - (12000 - 500));
  });

  it("uses a 500-char overlap between consecutive chunks", () => {
    const text = "x".repeat(30000);
    const chunks = chunkText(text, 12000, 500);
    expect(chunks.length).toBeGreaterThanOrEqual(3);
    expect(chunks[0]?.length).toBe(12000);
    expect(chunks[1]?.length).toBe(12000);
  });

  it("respects custom chunkSize and overlap", () => {
    const text = "abcdefghij";
    const chunks = chunkText(text, 4, 1);
    expect(chunks).toEqual(["abcd", "defg", "ghij"]);
  });

  it("returns empty array for empty input", () => {
    expect(chunkText("", 12000, 500)).toEqual([]);
  });

  it("does not exceed chunkSize per chunk", () => {
    const text = "x".repeat(100000);
    for (const c of chunkText(text, 12000, 500)) {
      expect(c.length).toBeLessThanOrEqual(12000);
    }
  });
});
