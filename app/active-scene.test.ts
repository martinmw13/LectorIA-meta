import { describe, expect, it } from "vitest";
import { pickActiveScene } from "./active-scene";

describe("pickActiveScene", () => {
  it("scrolls down: picks the last section at or above the line", () => {
    const sections = [
      { id: "a", top: -500 },
      { id: "b", top: -50 },
      { id: "c", top: 400 },
    ];
    expect(pickActiveScene(sections, 200)).toBe("b");
  });

  it("scrolls up: adopts the section whose top just crossed the line", () => {
    const sections = [
      { id: "a", top: -600 },
      { id: "b", top: -300 },
      { id: "c", top: 150 },
    ];
    expect(pickActiveScene(sections, 200)).toBe("c");
  });

  it("jumps: falls back to the first section when all tops are below the line", () => {
    const sections = [
      { id: "a", top: 300 },
      { id: "b", top: 900 },
    ];
    expect(pickActiveScene(sections, 200)).toBe("a");
  });

  it("returns null with no sections", () => {
    expect(pickActiveScene([], 200)).toBeNull();
  });
});
