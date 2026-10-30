import { describe, expect, it } from "vitest";
import { parseCapUsd } from "./env";

describe("parseCapUsd", () => {
  it("honors a finite non-negative value", () => {
    expect(parseCapUsd("3", 10)).toBe(3);
    expect(parseCapUsd("2.5", 10)).toBe(2.5);
  });

  it("keeps zero so a zero cap can block spend", () => {
    expect(parseCapUsd("0", 10)).toBe(0);
  });

  it.each([undefined, "", "  ", "abc", "-3", "Infinity", "NaN"])(
    "falls back for %s",
    (raw) => {
      expect(parseCapUsd(raw, 10)).toBe(10);
    },
  );
});
