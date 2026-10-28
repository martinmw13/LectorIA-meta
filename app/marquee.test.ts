import { describe, expect, it } from "vitest";
import { marqueeDurationMs } from "./marquee";

describe("marqueeDurationMs", () => {
  it("floors at about 6 s for no or small overflow", () => {
    expect(marqueeDurationMs(0)).toBe(6000);
    expect(marqueeDurationMs(-5)).toBe(6000);
    expect(marqueeDurationMs(30)).toBe(6000);
  });

  it("moves at about 30 px/s plus pauses", () => {
    expect(marqueeDurationMs(300)).toBe(12000);
    expect(marqueeDurationMs(600)).toBe(22000);
  });
});
