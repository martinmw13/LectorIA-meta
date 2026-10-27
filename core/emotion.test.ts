import { describe, expect, it } from "vitest";
import { jevFinal, needsOverride, renormalize8 } from "./emotion";

describe("needsOverride", () => {
  it("triggers on unknown choice", () => {
    expect(needsOverride({ choice: "unknown", confidence: 0.9, probabilities: { unknown: 0.5 } })).toBe(true);
  });
  it("triggers on low confidence", () => {
    expect(needsOverride({ choice: "combate", confidence: 0.59, probabilities: { combate: 0.5 } })).toBe(true);
  });
  it("triggers when unknown holds the max probability", () => {
    expect(needsOverride({ choice: "calma", confidence: 0.8, probabilities: { calma: 0.3, unknown: 0.4 } })).toBe(
      true,
    );
  });
  it("passes a confident known emotion", () => {
    expect(needsOverride({ choice: "combate", confidence: 0.87, probabilities: { combate: 0.9, unknown: 0.0 } })).toBe(
      false,
    );
  });
});

describe("renormalize8", () => {
  it("sums to 1 and fills missing ids", () => {
    const vector = renormalize8({ combate: 0.9, suspenso: 0.1 });
    expect(vector).not.toBeNull();
    const sum = Object.values(vector ?? {}).reduce((a, b) => a + b, 0);
    expect(sum).toBeCloseTo(1, 10);
    expect(vector?.calma).toBe(0);
  });
  it("clamps negatives and returns null for all zero", () => {
    expect(renormalize8({ combate: -2, calma: 4 })?.combate).toBe(0);
    expect(renormalize8({})).toBeNull();
    expect(renormalize8({ calma: 0, combate: -1 })).toBeNull();
  });
});

describe("jevFinal", () => {
  it("drops unknown and keeps intensity and tempo", () => {
    const final = jevFinal({ probabilities: { combate: 0.9, suspenso: 0.1, unknown: 0.0 }, intensity: 0.8, tempo: 0.5 });
    expect(final?.vector.combate).toBeCloseTo(0.9, 10);
    expect(final?.intensity).toBe(0.8);
    expect(final?.tempo).toBe(0.5);
  });
});
