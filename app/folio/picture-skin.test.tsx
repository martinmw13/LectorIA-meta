// @vitest-environment jsdom
// The skin owner (app/skin.ts) holds the live skin; picture-skin only
// maps it to a drawing variant. Unknown ids fall back to engraving.
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, test } from "vitest";
import { DEFAULT_SKIN, setSkin } from "../skin";
import { pictureSkin, pictureVariant, usePictureSkin } from "./picture-skin";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function Probe({ onSkin }: { onSkin: (skin: string) => void }) {
  onSkin(usePictureSkin());
  return null;
}

afterEach(() => {
  setSkin(DEFAULT_SKIN);
  try {
    localStorage.clear();
  } catch {
    // No storage in some runners: the dataset reset below is enough.
  }
  window.history.replaceState({}, "", "/");
  document.body.innerHTML = "";
});

test("every known skin id maps to its drawing variant", () => {
  expect(pictureVariant("engraving")).toBe("engraving");
  expect(pictureVariant("watercolor")).toBe("watercolor");
  expect(pictureVariant("ink")).toBe("ink");
  expect(pictureVariant("comic")).toBe("ink");
  expect(pictureVariant("chihiro")).toBe("watercolor");
  expect(pictureVariant("pencil")).toBe("engraving");
});

test("unknown, empty and missing ids fall back to engraving", () => {
  for (const value of ["default", "noir", "anime-ghibli", "toString", "", null, undefined]) {
    expect(pictureVariant(value)).toBe("engraving");
  }
});

test("pictureSkin reads the owner, not data-skin or ?skin= itself", () => {
  expect(pictureSkin()).toBe("engraving");
  document.documentElement.dataset.skin = "comic";
  expect(pictureSkin()).toBe("ink");
  window.history.replaceState({}, "", "/?skin=watercolor");
  expect(pictureSkin()).toBe("ink");
});

test("usePictureSkin follows the owner without a remount", () => {
  const seen: string[] = [];
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  act(() => {
    root.render(<Probe onSkin={(skin) => seen.push(skin)} />);
  });
  act(() => {
    setSkin("watercolor");
  });
  expect(seen.at(-1)).toBe("watercolor");
  act(() => {
    root.unmount();
  });
});
