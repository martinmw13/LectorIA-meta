import { describe, expect, it } from "vitest";
import { NARRATION_MANUAL_WINDOW_MS, shouldAutoTurn } from "./turn";

describe("shouldAutoTurn", () => {
  it("turns when the reader never moved by hand", () => {
    expect(shouldAutoTurn(null, 1000)).toBe(true);
  });

  it("holds back inside the window after a manual move", () => {
    expect(shouldAutoTurn(1000, 1000 + NARRATION_MANUAL_WINDOW_MS - 1)).toBe(false);
  });

  it("turns again once the window passes", () => {
    expect(shouldAutoTurn(1000, 1000 + NARRATION_MANUAL_WINDOW_MS)).toBe(true);
    expect(shouldAutoTurn(1000, 1000 + NARRATION_MANUAL_WINDOW_MS + 5000)).toBe(true);
  });
});
