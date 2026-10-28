// Thresholds for the cover's data-long title step.
import { describe, expect, it } from "vitest";
import { coverTitleLong } from "./panels";

describe("coverTitleLong", () => {
  it("keeps short titles at full size", () => {
    expect(coverTitleLong("The Cyclone")).toBeUndefined();
    expect(coverTitleLong("x".repeat(24))).toBeUndefined();
  });

  it("steps down past 24 and 36 chars", () => {
    expect(coverTitleLong("x".repeat(25))).toBe("1");
    expect(coverTitleLong("The Council with the Munchkins")).toBe("1");
    expect(coverTitleLong("x".repeat(36))).toBe("1");
    expect(coverTitleLong("x".repeat(37))).toBe("2");
    expect(coverTitleLong("Glinda The Good Witch Grants Dorothy’s Wish")).toBe("2");
  });
});
