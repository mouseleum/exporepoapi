import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import HomePage from "@/app/page";

describe("page shell smoke", () => {
  it("renders header and the ranker hero", () => {
    render(<HomePage />);

    expect(screen.getByText("Exhibitor Tools")).toBeInTheDocument();
    expect(screen.getByText("targets")).toBeInTheDocument();
  });

  it("no longer offers a List Guide tab", () => {
    render(<HomePage />);

    expect(
      screen.queryByRole("button", { name: /list guide/i }),
    ).not.toBeInTheDocument();
    expect(document.getElementById("panel-guide")).toBeNull();
  });
});
