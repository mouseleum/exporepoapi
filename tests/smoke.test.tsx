import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import HomePage from "@/app/page";

describe("page shell smoke", () => {
  it("renders header, both hero copies, and toggles tab panels", () => {
    render(<HomePage />);

    expect(screen.getByText("Exhibitor Tools")).toBeInTheDocument();
    expect(screen.getByText("targets")).toBeInTheDocument();
    expect(screen.getByText("exhibitor list")).toBeInTheDocument();

    const rankerPanel = document.getElementById("panel-ranker");
    const guidePanel = document.getElementById("panel-guide");
    expect(rankerPanel?.classList.contains("active")).toBe(true);
    expect(guidePanel?.classList.contains("active")).toBe(false);

    fireEvent.click(screen.getByRole("button", { name: /list guide/i }));

    expect(rankerPanel?.classList.contains("active")).toBe(false);
    expect(guidePanel?.classList.contains("active")).toBe(true);
  });
});
