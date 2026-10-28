import { describe, expect, it } from "vitest";
import {
  canIllustrateScene,
  canRetryFigure,
  figuresAfter,
  groupFiguresByEndN,
} from "./figure-placement";

const p = (n: number, id: string) => ({ n, id });

describe("groupFiguresByEndN", () => {
  it("groups by endN keeping insertion order", () => {
    const figs = [
      { id: "a", endN: 2 },
      { id: "b", endN: 1 },
      { id: "c", endN: 2 },
    ];
    const grouped = groupFiguresByEndN(figs);
    expect(grouped.get(2)?.map((f) => f.id)).toEqual(["a", "c"]);
    expect(grouped.get(1)?.map((f) => f.id)).toEqual(["b"]);
  });

  it("returns an empty map with no figures", () => {
    expect(groupFiguresByEndN([]).size).toBe(0);
  });
});

describe("figuresAfter", () => {
  it("renders figures after a whole paragraph", () => {
    const grouped = groupFiguresByEndN([
      { id: "a", endN: 1 },
      { id: "b", endN: 2 },
    ]);
    expect(figuresAfter([p(1, "x"), p(2, "y")], 0, grouped).map((f) => f.id)).toEqual(["a"]);
  });

  it("renders only after the last fragment of a split paragraph on that page", () => {
    const grouped = groupFiguresByEndN([{ id: "a", endN: 5 }]);
    const page = [p(5, "f1"), { ...p(5, "f2"), cont: true }, p(6, "g")];
    expect(figuresAfter(page, 0, grouped)).toEqual([]);
    expect(figuresAfter(page, 1, grouped).map((f) => f.id)).toEqual(["a"]);
  });

  it("renders after the last visible fragment on each page when split across pages", () => {
    // Current behavior, kept as is: a paragraph split across two pages
    // shows its figures on both, after each page's last visible fragment.
    const grouped = groupFiguresByEndN([{ id: "a", endN: 5 }]);
    const first = [p(5, "f1")];
    const second = [{ ...p(5, "f2"), cont: true }, p(6, "g")];
    expect(figuresAfter(first, 0, grouped).map((f) => f.id)).toEqual(["a"]);
    expect(figuresAfter(second, 0, grouped).map((f) => f.id)).toEqual(["a"]);
  });

  it("renders several figures on one paragraph and none without figures", () => {
    const grouped = groupFiguresByEndN([
      { id: "a", endN: 1 },
      { id: "b", endN: 1 },
    ]);
    expect(figuresAfter([p(1, "x")], 0, grouped).map((f) => f.id)).toEqual(["a", "b"]);
    expect(figuresAfter([p(9, "z")], 0, grouped)).toEqual([]);
  });
});

describe("request gates", () => {
  it("retry only from the error phase", () => {
    expect(canRetryFigure({ phase: "error" }, false)).toBe(true);
    expect(canRetryFigure({ phase: "loading" }, false)).toBe(false);
    expect(canRetryFigure({ phase: "ready" }, false)).toBe(false);
    expect(canRetryFigure({ phase: "error" }, true)).toBe(false);
    expect(canRetryFigure(undefined, false)).toBe(false);
  });

  it("scene refused when cached or without an id", () => {
    expect(canIllustrateScene({ sceneId: "s1", busy: false, cached: false })).toBe(true);
    expect(canIllustrateScene({ sceneId: "s1", busy: true, cached: false })).toBe(false);
    expect(canIllustrateScene({ sceneId: "s1", busy: false, cached: true })).toBe(false);
    expect(canIllustrateScene({ sceneId: "", busy: false, cached: false })).toBe(false);
  });
});
