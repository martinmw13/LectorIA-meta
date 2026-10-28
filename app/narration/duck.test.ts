import { describe, expect, it } from "vitest";
import {
  NARRATION_DUCK_DOWN_MS,
  NARRATION_DUCK_LEVEL,
  NARRATION_DUCK_UP_MS,
  rampDuck,
} from "./duck";

describe("duck ramp", () => {
  it("sits about 18 dB down at full duck", () => {
    expect(20 * Math.log10(NARRATION_DUCK_LEVEL)).toBeCloseTo(-18, 5);
    expect(NARRATION_DUCK_LEVEL).toBeGreaterThan(0.1);
    expect(NARRATION_DUCK_LEVEL).toBeLessThan(0.15);
  });

  it("lands on target within one full ramp each way", () => {
    expect(rampDuck(1, NARRATION_DUCK_LEVEL, NARRATION_DUCK_DOWN_MS, NARRATION_DUCK_DOWN_MS)).toBe(
      NARRATION_DUCK_LEVEL,
    );
    expect(rampDuck(NARRATION_DUCK_LEVEL, 1, NARRATION_DUCK_UP_MS, NARRATION_DUCK_UP_MS)).toBe(1);
  });

  it("moves partway on a partial slice and never overshoots", () => {
    const half = rampDuck(1, NARRATION_DUCK_LEVEL, NARRATION_DUCK_DOWN_MS / 2, NARRATION_DUCK_DOWN_MS);
    expect(half).toBeGreaterThan(NARRATION_DUCK_LEVEL);
    expect(half).toBeLessThan(1);
    expect(rampDuck(1, NARRATION_DUCK_LEVEL, NARRATION_DUCK_DOWN_MS * 3, NARRATION_DUCK_DOWN_MS)).toBe(
      NARRATION_DUCK_LEVEL,
    );
  });

  it("holds on a zero slice and jumps on a zero duration", () => {
    expect(rampDuck(0.9, NARRATION_DUCK_LEVEL, 0, NARRATION_DUCK_DOWN_MS)).toBe(0.9);
    expect(rampDuck(0.9, NARRATION_DUCK_LEVEL, 10, 0)).toBe(NARRATION_DUCK_LEVEL);
  });
});
