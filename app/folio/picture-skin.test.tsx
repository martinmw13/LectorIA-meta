// @vitest-environment jsdom
// The skin owner (app/skin.ts) holds the live skin; picture-skin only
// maps it to a drawing variant: every skin draws its own, unknown ids
// fall back to engraving.
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, test } from "vitest";
import { DEFAULT_SKIN, SKINS, setSkin } from "../skin";
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

test("every known skin id draws its own variant", () => {
  for (const skin of SKINS) expect(pictureVariant(skin)).toBe(skin);
});

test("unknown, empty and missing ids fall back to engraving", () => {
  for (const value of ["default", "noir", "anime-ghibli", "toString", "", null, undefined]) {
    expect(pictureVariant(value)).toBe("engraving");
  }
});

test("pictureSkin reads the owner, not ?skin= itself", () => {
  expect(pictureSkin()).toBe("engraving");
  document.documentElement.dataset.skin = "comic";
  expect(pictureSkin()).toBe("comic");
  window.history.replaceState({}, "", "/?skin=watercolor");
  expect(pictureSkin()).toBe("comic");
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
