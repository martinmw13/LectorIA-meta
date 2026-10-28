import { describe, expect, it } from "vitest";
import { engravingScale, highlightStyleFor } from "./highlight-style";

describe("highlightStyleFor", () => {
  it("maps each decided skin to its treatment", () => {
    expect(highlightStyleFor("engraving")).toBe("engraving");
    expect(highlightStyleFor("watercolor")).toBe("watercolor");
    expect(highlightStyleFor("ink-doodle")).toBe("ink-doodle");
  });

  it("falls back to engraving for today and unknown skins", () => {
    expect(highlightStyleFor("default")).toBe("engraving");
    expect(highlightStyleFor("")).toBe("engraving");
    expect(highlightStyleFor("noir")).toBe("engraving");
  });
});

describe("engravingScale", () => {
  it("shrinks the overlay to the measured word width", () => {
    expect(engravingScale(40, 50)).toBeCloseTo(0.8, 5);
  });

  it("never stretches a narrower overlay", () => {
    expect(engravingScale(50, 40)).toBe(1);
    expect(engravingScale(40, 40)).toBe(1);
  });

  it("stays at 1 when either width is missing", () => {
    expect(engravingScale(40, 0)).toBe(1);
    expect(engravingScale(0, 50)).toBe(1);
  });
});
