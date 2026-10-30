/**
 * @vitest-environment jsdom
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { existsSync } from "node:fs";
import { getSkin, SKINS, setSkin } from "../skin";
import { SKIN_NAMES } from "../style-menu";
import { StylePicker } from "./style-picker";

(globalThis as unknown as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root | null = null;

const radios = () => [...container.querySelectorAll<HTMLButtonElement>('[role="radio"]')];
const checked = () => radios().filter((r) => r.getAttribute("aria-checked") === "true");

function key(el: Element | undefined, k: string) {
  act(() => {
    el?.dispatchEvent(new KeyboardEvent("keydown", { key: k, bubbles: true }));
  });
}

beforeEach(() => {
  try {
    window.localStorage.clear();
  } catch {
    // jsdom without storage: the skin owner tolerates it.
  }
  act(() => setSkin("engraving"));
  container = document.createElement("div");
  document.body.appendChild(container);
  act(() => {
    root = createRoot(container);
    root.render(<StylePicker />);
  });
});

afterEach(() => {
  act(() => root?.unmount());
  root = null;
  container.remove();
});

describe("home style picker", () => {
  it("offers every skin by name under a warm prompt, live one checked", () => {
    const group = container.querySelector('[role="radiogroup"]');
    const title = container.querySelector(`#${group?.getAttribute("aria-labelledby")}`);
    expect(title?.textContent).toBe("Pick your style");
    expect(radios().map((r) => r.textContent)).toEqual(SKINS.map((s) => SKIN_NAMES[s]));
    expect(checked().map((r) => r.textContent)).toEqual([SKIN_NAMES.engraving]);
    expect(radios().map((r) => r.tabIndex)).toEqual(SKINS.map((s) => (s === "engraving" ? 0 : -1)));
  });

  it("switches the skin on click, like the menu", () => {
    act(() => radios()[SKINS.indexOf("comic")]!.click());
    expect(getSkin()).toBe("comic");
    expect(document.documentElement.dataset.skin).toBe("comic");
    expect(checked().map((r) => r.textContent)).toEqual([SKIN_NAMES.comic]);
  });

  it("moves the choice and focus with arrows, Home and End, wrapping", () => {
    const first = radios()[0]!;
    key(first, "ArrowRight");
    expect(getSkin()).toBe(SKINS[1]);
    expect(document.activeElement).toBe(radios()[1]);
    key(radios()[1], "End");
    expect(getSkin()).toBe(SKINS[SKINS.length - 1]);
    key(radios()[SKINS.length - 1], "ArrowRight");
    expect(getSkin()).toBe(SKINS[0]);
    key(radios()[0], "ArrowLeft");
    expect(getSkin()).toBe(SKINS[SKINS.length - 1]);
    key(radios()[SKINS.length - 1], "Home");
    expect(getSkin()).toBe(SKINS[0]);
  });

  it("shows a swatch cut from each skin's painting", () => {
    for (const [i, s] of SKINS.entries()) {
      const img = radios()[i]!.querySelector("img");
      expect(img?.getAttribute("src")).toBe(`/art/skins/${s}/swatch.jpg`);
      expect(img?.getAttribute("alt")).toBe("");
      expect(existsSync(`public/art/skins/${s}/swatch.jpg`)).toBe(true);
    }
  });
});
