import { describe, expect, it } from "vitest";
import { slugify } from "../components/ranker/SaveToLibrary";

describe("slugify", () => {
  it("kebab-cases the name and appends the year", () => {
    expect(slugify("Vitafoods Europe", 2026)).toBe("vitafoods-europe-2026");
  });

  it("does not duplicate the year when the name already ends with it", () => {
    expect(slugify("Vitafoods 2026", 2026)).toBe("vitafoods-2026");
    expect(slugify("vitafoods-2026", 2026)).toBe("vitafoods-2026");
  });

  it("returns just the slug when year is null", () => {
    expect(slugify("Vitafoods Europe", null)).toBe("vitafoods-europe");
  });

  it("returns '' when name has no alphanumerics", () => {
    expect(slugify("---", 2026)).toBe("");
  });

  it("collapses repeated punctuation", () => {
    expect(slugify("A & B Co!!", 2025)).toBe("a-b-co-2025");
  });
});
