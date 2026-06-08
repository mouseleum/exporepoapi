import { describe, expect, it } from "vitest";
import { extractRegistrableDomain } from "../lib/hubspot/domain";

describe("extractRegistrableDomain", () => {
  it.each<[string | null | undefined, string | null]>([
    [null, null],
    [undefined, null],
    ["", null],
    ["   ", null],
    ["https://example.com", "example.com"],
    ["http://example.com/", "example.com"],
    ["https://www.example.com/about", "example.com"],
    ["www.example.com", "example.com"],
    ["example.com", "example.com"],
    ["example.com/foo?bar=1", "example.com"],
    ["EXAMPLE.com", "example.com"],
    ["https://EXAMPLE.com/", "example.com"],
    ["https://example.com:8080/foo", "example.com"],
    ["sub.example.com", "sub.example.com"],
    ["labs.acme.co.uk", "labs.acme.co.uk"],
    ["not a url", null],          // space-containing garbage fails URL parse
    ["mailto:foo@example.com", null], // non-http scheme has no host
    ["://broken", null],
  ])("%s -> %s", (input, expected) => {
    expect(extractRegistrableDomain(input)).toBe(expected);
  });
});
