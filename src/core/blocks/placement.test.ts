import { describe, expect, it } from "vitest";

import { isInteger, toInteger, type Integer } from "./placement.ts";

function acceptInteger(_value: Integer): void {}

describe("integer placement coordinates", () => {
  it("converts whole numbers without changing their value", () => {
    expect(toInteger(0)).toBe(0);
    expect(toInteger(4)).toBe(4);
    expect(toInteger(-3)).toBe(-3);
    expect(isInteger(2)).toBe(true);
  });

  it("rejects fractional and non-finite values", () => {
    for (const value of [
      1.5,
      -0.5,
      Number.NaN,
      Number.POSITIVE_INFINITY,
      Number.NEGATIVE_INFINITY,
    ]) {
      expect(isInteger(value)).toBe(false);
      expect(() => toInteger(value)).toThrow(RangeError);
    }
  });

  it("rejects ordinary numbers at compile time", () => {
    // @ts-expect-error a plain number is not a nominal integer coordinate
    const start: Integer = 1;
    void start;

    // @ts-expect-error ordinary numbers cannot be passed as integer coordinates
    acceptInteger(2);
  });
});
