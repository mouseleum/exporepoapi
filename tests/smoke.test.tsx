import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import HomePage from "@/app/page";

describe("scaffold smoke", () => {
  it("renders the Phase 0 placeholder", () => {
    render(<HomePage />);
    expect(screen.getByText("Phase 0 scaffold")).toBeInTheDocument();
  });
});
