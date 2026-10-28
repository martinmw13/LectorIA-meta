import { describe, expect, it } from "vitest";
import {
  AMBIENCE_DUCK_DB,
  MUSIC_DUCK_DB,
  NARRATION_DUCK_DOWN_MS,
  NARRATION_DUCK_UP_MS,
  duckTarget,
  rampDuck,
} from "./duck";

describe("duckTarget", () => {
  it("cuts music about 11 dB and rain about 6 dB only while narrating", () => {
    expect(20 * Math.log10(duckTarget(true, MUSIC_DUCK_DB))).toBeCloseTo(-11, 5);
    expect(20 * Math.log10(duckTarget(true, AMBIENCE_DUCK_DB))).toBeCloseTo(-6, 5);
    expect(duckTarget(false, MUSIC_DUCK_DB)).toBe(1);
    expect(duckTarget(false, AMBIENCE_DUCK_DB)).toBe(1);
  });

  it("ramps about 300 ms each way", () => {
    expect(NARRATION_DUCK_DOWN_MS).toBe(300);
    expect(NARRATION_DUCK_UP_MS).toBe(300);
  });
});

describe("duck ramp", () => {
  const level = duckTarget(true, MUSIC_DUCK_DB);

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
