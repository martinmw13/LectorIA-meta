import { describe, expect, it } from "vitest";
import { paginateScene, textPageAt } from "@/core/reader";
import { autoTurnTarget, NARRATION_MANUAL_WINDOW_MS, shouldAutoTurn } from "./turn";

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

// Three real text pages shaped like c3s2: one long paragraph per page.
function c3s2Pages() {
  const paras = [90, 91, 92].map((n) => ({
    id: `c3p${n}`,
    n,
    text: `Word ${n} ` + "lorem ipsum dolor sit amet ".repeat(22),
  }));
  return paginateScene(paras);
}

describe("autoTurnTarget", () => {
  it("turns onto the page holding the spoken paragraph", () => {
    const pages = c3s2Pages();
    expect(pages.length).toBe(3);
    expect(autoTurnTarget(pages, 91, 0, null, 1000)).toBe(1);
    expect(autoTurnTarget(pages, 92, 1, null, 1000)).toBe(2);
  });

  it("stays when the voice is already on screen", () => {
    const pages = c3s2Pages();
    expect(autoTurnTarget(pages, 90, 0, null, 1000)).toBeNull();
  });

  it("stays when the spoken paragraph is on no page", () => {
    const pages = c3s2Pages();
    expect(autoTurnTarget(pages, 999, 0, null, 1000)).toBeNull();
  });

  it("holds inside the manual window, then turns", () => {
    const pages = c3s2Pages();
    expect(autoTurnTarget(pages, 91, 0, 1000, 1000 + NARRATION_MANUAL_WINDOW_MS - 1)).toBeNull();
    expect(autoTurnTarget(pages, 91, 0, 1000, 1000 + NARRATION_MANUAL_WINDOW_MS)).toBe(1);
  });

  it("turns from the chapter cover onto the first text page", () => {
    const pages = c3s2Pages();
    const textPage = textPageAt(0, true);
    const target = autoTurnTarget(pages, 90, textPage, null, 1000);
    expect(target).toBe(0);
    // scene-page maps the text index back past the cover.
    expect((target ?? 0) + 1).toBe(1);
  });
});
