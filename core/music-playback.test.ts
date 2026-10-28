import { describe, expect, it } from "vitest";
import { effectiveEnd, gainVolume } from "./music-playback";

describe("gainVolume", () => {
  it("passes the level through at 0 dB", () => {
    expect(gainVolume(0.5, 0.8, 0)).toBeCloseTo(0.4, 10);
  });

  it("applies positive and negative gain", () => {
    expect(gainVolume(0.5, 0.8, 6)).toBeCloseTo(0.4 * 10 ** (6 / 20), 10);
    expect(gainVolume(1, 1, -20)).toBeCloseTo(0.1, 10);
    expect(gainVolume(1, 1, 6)).toBe(1);
  });

  it("clamps above 1 and below 0", () => {
    expect(gainVolume(1, 1, 12)).toBe(1);
    expect(gainVolume(-0.5, 0.8, 0)).toBe(0);
    expect(gainVolume(0.5, -0.8, 0)).toBe(0);
  });
});

describe("effectiveEnd", () => {
  it("uses endSec when it ends before the file", () => {
    expect(effectiveEnd(40, 200)).toBe(40);
  });

  it("uses the file duration without endSec or past it", () => {
    expect(effectiveEnd(undefined, 200)).toBe(200);
    expect(effectiveEnd(500, 200)).toBe(200);
  });
});
