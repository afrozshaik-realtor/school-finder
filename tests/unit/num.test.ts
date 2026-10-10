import { describe, it, expect } from "vitest";
import { toFiniteNumber } from "../../scripts/lib/num";

describe("toFiniteNumber", () => {
  it("parses a normal numeric string", () => {
    expect(toFiniteNumber("51.05")).toBe(51.05);
    expect(toFiniteNumber("-114.07")).toBe(-114.07);
    expect(toFiniteNumber("0")).toBe(0);
  });

  it("returns NaN for an empty string -- NOT 0 -- so a blank CSV cell is never silently treated as a real coordinate", () => {
    expect(Number.isNaN(toFiniteNumber(""))).toBe(true);
  });

  it("returns NaN for whitespace-only input", () => {
    expect(Number.isNaN(toFiniteNumber("   "))).toBe(true);
  });

  it("returns NaN for undefined (column missing from the row)", () => {
    expect(Number.isNaN(toFiniteNumber(undefined))).toBe(true);
  });

  it("returns NaN for non-numeric garbage", () => {
    expect(Number.isNaN(toFiniteNumber("not-a-number"))).toBe(true);
  });

  it("regression: Number('') is 0 in plain JS -- this helper exists specifically to avoid that", () => {
    expect(Number("")).toBe(0);
    expect(toFiniteNumber("")).not.toBe(0);
  });
});
