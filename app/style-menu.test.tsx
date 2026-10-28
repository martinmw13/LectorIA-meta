/**
 * @vitest-environment jsdom
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { getSkin, SKINS, setSkin } from "./skin";
import { SKIN_NAMES, StyleMenu } from "./style-menu";

(globalThis as unknown as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root | null = null;

function trigger(): HTMLButtonElement {
  const el = container.querySelector<HTMLButtonElement>(".style-menu-btn");
  if (!el) throw new Error("style button missing");
  return el;
}

function items(): HTMLButtonElement[] {
  return [...container.querySelectorAll<HTMLButtonElement>('[role="menuitemradio"]')];
}

function key(el: Element | undefined, k: string) {
  act(() => {
    el?.dispatchEvent(new KeyboardEvent("keydown", { key: k, bubbles: true }));
  });
}

// openAt focuses on the next frame; flush it inside act.
async function flushFrame() {
  await act(async () => {
    await new Promise((r) => requestAnimationFrame(() => r(null)));
  });
}

beforeEach(() => {
  document.documentElement.dataset.skin = "engraving";
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
    root.render(<StyleMenu />);
  });
});

afterEach(() => {
  act(() => root?.unmount());
  root = null;
  container.remove();
});

describe("style menu", () => {
  it("shows 'Style: <Name>' in the live skin's lettering and names it in the label", () => {
    for (const skin of SKINS) {
      act(() => setSkin(skin));
      const name = SKIN_NAMES[skin];
      expect(trigger().textContent).toBe(`Style:${name}`);
      expect(trigger().getAttribute("aria-label")).toBe(`Change style, now ${name}`);
      expect(trigger().querySelector(".style-name")?.getAttribute("data-face")).toBe(skin);
    }
  });

  it("opens on click with all six styles, each in its own lettering, the live one checked", async () => {
    expect(trigger().getAttribute("aria-expanded")).toBe("false");
    act(() => trigger().click());
    await flushFrame();
    expect(trigger().getAttribute("aria-expanded")).toBe("true");
    const list = items();
    expect(list.map((i) => i.textContent)).toEqual(SKINS.map((s) => SKIN_NAMES[s]));
    expect(list.map((i) => i.querySelector(".style-name")?.getAttribute("data-face"))).toEqual([...SKINS]);
    expect(list.filter((i) => i.getAttribute("aria-checked") === "true")).toHaveLength(1);
    expect(list[0]?.getAttribute("aria-checked")).toBe("true");
    expect(document.activeElement).toBe(list[0]);
  });

  it("picks a style on click, closes and returns focus", async () => {
    act(() => trigger().click());
    await flushFrame();
    act(() => items()[4]?.click());
    expect(getSkin()).toBe("comic");
    expect(document.documentElement.dataset.skin).toBe("comic");
    expect(items()).toHaveLength(0);
    expect(document.activeElement).toBe(trigger());
  });

  it("drives with the keyboard: arrows wrap, Home/End, Enter picks, Esc closes", async () => {
    trigger().focus();
    key(trigger(), "ArrowDown");
    await flushFrame();
    expect(document.activeElement).toBe(items()[0]);
    key(items()[0], "ArrowUp");
    expect(document.activeElement).toBe(items()[5]);
    key(items()[5], "ArrowDown");
    expect(document.activeElement).toBe(items()[0]);
    key(items()[0], "End");
    expect(document.activeElement).toBe(items()[5]);
    key(items()[5], "Home");
    key(items()[0], "ArrowDown");
    expect(document.activeElement).toBe(items()[1]);
    key(items()[1], "Escape");
    expect(items()).toHaveLength(0);
    expect(document.activeElement).toBe(trigger());
    expect(getSkin()).toBe("engraving");
  });

  it("closes on an outside press without changing the style", async () => {
    act(() => trigger().click());
    await flushFrame();
    act(() => {
      document.body.dispatchEvent(new Event("pointerdown", { bubbles: true }));
    });
    expect(items()).toHaveLength(0);
    expect(getSkin()).toBe("engraving");
  });
});
