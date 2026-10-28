/**
 * @vitest-environment jsdom
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { getSkin, SKINS, setSkin } from "../skin";
import { SKIN_NAMES, StyleStamp } from "./style-stamp";

(globalThis as unknown as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root | null = null;

function render() {
  act(() => {
    root?.render(<StyleStamp />);
  });
}

function button(): HTMLButtonElement {
  const el = container.querySelector("button");
  if (!el) throw new Error("stamp button missing");
  return el;
}

function ringText(): string {
  return container.querySelector("textPath")?.textContent ?? "";
}

function pill(): HTMLElement | null {
  return container.querySelector('[role="status"]');
}

beforeEach(() => {
  document.documentElement.dataset.skin = "engraving";
  try {
    window.localStorage.clear();
  } catch {
    // jsdom without storage: the skin owner tolerates it.
  }
  container = document.createElement("div");
  document.body.appendChild(container);
  act(() => {
    root = createRoot(container);
  });
  render();
});

afterEach(() => {
  vi.useRealTimers();
  act(() => {
    root?.unmount();
  });
  root = null;
  container.remove();
});

describe("style stamp", () => {
  it("names every skin on the ring and the aria-label", () => {
    for (const skin of SKINS) {
      act(() => {
        setSkin(skin);
      });
      const name = SKIN_NAMES[skin];
      expect(button().getAttribute("aria-label")).toBe(`Change style, now ${name}`);
      expect(ringText()).toBe(`CHANGE STYLE \u2022 ${name.toUpperCase()} \u2022`);
    }
  });

  it("cycles through the skin owner on click", () => {
    expect(getSkin()).toBe("engraving");
    act(() => {
      button().dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(getSkin()).toBe("watercolor");
    expect(button().getAttribute("aria-label")).toBe("Change style, now Watercolor");
    // Never writes data-skin itself: skin.ts owns the attribute.
    expect(document.documentElement.dataset.skin).toBe("watercolor");
  });

  it("shows the Now pill only after a click and hides it after about 1.8 s", () => {
    vi.useFakeTimers();
    expect(pill()?.classList.contains("ob-show")).toBe(false);
    act(() => {
      button().dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(pill()?.classList.contains("ob-show")).toBe(true);
    expect(pill()?.textContent).toContain("Watercolor");
    act(() => {
      vi.advanceTimersByTime(1700);
    });
    expect(pill()?.classList.contains("ob-show")).toBe(true);
    act(() => {
      vi.advanceTimersByTime(200);
    });
    expect(pill()?.classList.contains("ob-show")).toBe(false);
  });

  it("restarts the pill timer on rapid clicks and clears it on unmount", () => {
    vi.useFakeTimers();
    const clearSpy = vi.spyOn(globalThis, "clearTimeout");
    try {
      act(() => {
        button().dispatchEvent(new MouseEvent("click", { bubbles: true }));
      });
      act(() => {
        vi.advanceTimersByTime(1500);
      });
      act(() => {
        button().dispatchEvent(new MouseEvent("click", { bubbles: true }));
      });
      act(() => {
        vi.advanceTimersByTime(1500);
      });
      expect(pill()?.classList.contains("ob-show")).toBe(true);
      const clearsBeforeUnmount = clearSpy.mock.calls.length;
      act(() => {
        root?.unmount();
      });
      root = null;
      expect(clearSpy.mock.calls.length).toBeGreaterThan(clearsBeforeUnmount);
    } finally {
      clearSpy.mockRestore();
    }
  });
});
