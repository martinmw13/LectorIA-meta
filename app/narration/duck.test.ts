import { describe, expect, it } from "vitest";
import {
  NARRATION_DUCK_DB,
  NARRATION_DUCK_DOWN_MS,
  NARRATION_DUCK_UP_MS,
  duckMultiplier,
  rampDuck,
} from "./duck";

describe("duckMultiplier", () => {
  it("holds the music about 20 dB below a full voice", () => {
    expect(NARRATION_DUCK_DB).toBe(20);
    const duck = duckMultiplier(0.8, 1);
    expect(duck).toBeCloseTo(0.1 / 0.8, 5);
    expect(20 * Math.log10(0.8 * duck)).toBeCloseTo(20 * Math.log10(1) - 20, 5);
  });

  it("tracks a quieter voice down", () => {
    expect(duckMultiplier(0.8, 0.5)).toBeCloseTo(0.05 / 0.8, 5);
  });

  it("leaves music already quieter than the cap alone", () => {
    expect(duckMultiplier(0.05, 1)).toBe(1);
  });

  it("is a no-op on muted music and a bad voice, silence on a zero voice", () => {
    expect(duckMultiplier(0, 1)).toBe(1);
    expect(duckMultiplier(NaN, 1)).toBe(1);
    expect(duckMultiplier(0.8, NaN)).toBe(1);
    expect(duckMultiplier(0.8, 0)).toBe(0);
  });
});

describe("duck ramp", () => {
  const level = duckMultiplier(0.8, 1);

  it("lands on target within one full ramp each way", () => {
    expect(rampDuck(1, level, NARRATION_DUCK_DOWN_MS, NARRATION_DUCK_DOWN_MS)).toBe(level);
    expect(rampDuck(level, 1, NARRATION_DUCK_UP_MS, NARRATION_DUCK_UP_MS)).toBe(1);
  });

  it("moves partway on a partial slice and never overshoots", () => {
    const half = rampDuck(1, level, NARRATION_DUCK_DOWN_MS / 2, NARRATION_DUCK_DOWN_MS);
    expect(half).toBeGreaterThan(level);
    expect(half).toBeLessThan(1);
    expect(rampDuck(1, level, NARRATION_DUCK_DOWN_MS * 3, NARRATION_DUCK_DOWN_MS)).toBe(level);
  });

  it("holds on a zero slice and jumps on a zero duration", () => {
    expect(rampDuck(0.9, level, 0, NARRATION_DUCK_DOWN_MS)).toBe(0.9);
    expect(rampDuck(0.9, level, 10, 0)).toBe(level);
  });

  it("lands within the duration when stepped frame by frame", () => {
    let v = level;
    for (let t = 0; t < NARRATION_DUCK_UP_MS; t += 16) v = rampDuck(v, 1, 16, NARRATION_DUCK_UP_MS);
    expect(v).toBe(1);
  });
});
