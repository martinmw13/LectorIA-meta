// @vitest-environment jsdom
import { afterEach, expect, test } from "vitest";
import { pictureSkin } from "./picture-skin";

afterEach(() => {
  delete document.documentElement.dataset.skin;
  window.history.replaceState({}, "", "/");
});

test("defaults to engraving with no dataset and no param", () => {
  expect(pictureSkin()).toBe("engraving");
});

test("reads data-skin first", () => {
  document.documentElement.dataset.skin = "watercolor";
  window.history.replaceState({}, "", "/?skin=ink");
  expect(pictureSkin()).toBe("watercolor");
});

test("falls back to the ?skin= param", () => {
  window.history.replaceState({}, "", "/?skin=ink");
  expect(pictureSkin()).toBe("ink");
});

test("unknown values and default become engraving", () => {
  for (const value of ["default", "noir", ""]) {
    document.documentElement.dataset.skin = value;
    expect(pictureSkin()).toBe("engraving");
  }
  window.history.replaceState({}, "", "/?skin=default");
  expect(pictureSkin()).toBe("engraving");
});
