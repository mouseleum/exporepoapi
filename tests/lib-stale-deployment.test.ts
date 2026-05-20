import { describe, expect, it } from "vitest";
import { isStaleDeploymentError } from "../lib/stale-deployment";

describe("isStaleDeploymentError", () => {
  it("matches the 'was not found on the server' phrasing", () => {
    expect(
      isStaleDeploymentError(
        'Server Action "0044816d7915da07f9144e4bb16bc8ff1b512dfceb" was not found on the server.',
      ),
    ).toBe(true);
  });

  it("matches the 'Failed to find Server Action' phrasing", () => {
    expect(
      isStaleDeploymentError(
        'Failed to find Server Action "abc". This request might be from an older or newer deployment.',
      ),
    ).toBe(true);
  });

  it("matches the 'older or newer deployment' phrasing on its own", () => {
    expect(
      isStaleDeploymentError("This request might be from an older or newer deployment."),
    ).toBe(true);
  });

  it("matches when given an Error instance, not just a string", () => {
    expect(
      isStaleDeploymentError(
        new Error('Server Action "x" was not found on the server.'),
      ),
    ).toBe(true);
  });

  it("matches even when the message is wrapped by a caller prefix", () => {
    expect(
      isStaleDeploymentError(
        'Load failed: Server Action "x" was not found on the server.',
      ),
    ).toBe(true);
  });

  it("does not match unrelated errors", () => {
    expect(isStaleDeploymentError("Slug 'intersolar' already exists")).toBe(
      false,
    );
    expect(isStaleDeploymentError(new Error("Network request failed"))).toBe(
      false,
    );
    expect(isStaleDeploymentError("")).toBe(false);
  });

  it("does not throw on non-string, non-Error values", () => {
    expect(isStaleDeploymentError(null)).toBe(false);
    expect(isStaleDeploymentError(undefined)).toBe(false);
    expect(isStaleDeploymentError(42)).toBe(false);
    expect(isStaleDeploymentError({})).toBe(false);
  });
});
