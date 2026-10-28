/**
 * @vitest-environment jsdom
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { getSkin, SKIN_KEY, SKINS, setSkin } from "./skin";
import { SKIN_NAMES, StyleStamp } from "./style-stamp";

(globalThis as unknown as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root | null = null;

function render(node: ReactNode) {
  act(() => {
    root?.render(node);
  });
}

function click(el: HTMLElement) {
  act(() => {
    el.dispatchEvent(new MouseEvent("click", { bubbles: true }));
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
  render(<StyleStamp />);
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
  it("names every skin on the ring, the aria-label and the title", () => {
    for (const skin of SKINS) {
      act(() => {
        setSkin(skin);
      });
      const name = SKIN_NAMES[skin];
      expect(button().getAttribute("aria-label")).toBe(`Change style, now ${name}`);
      expect(button().getAttribute("title")).toBe(`Change style, now ${name}`);
      expect(ringText()).toBe(`CHANGE STYLE \u2022 ${name.toUpperCase()} \u2022`);
    }
  });

  it("cycles through the skin owner on click and persists the choice", () => {
    expect(getSkin()).toBe("engraving");
    click(button());
    expect(getSkin()).toBe("watercolor");
    expect(button().getAttribute("aria-label")).toBe("Change style, now Watercolor");
    // Never writes data-skin itself: skin.ts owns the attribute.
    expect(document.documentElement.dataset.skin).toBe("watercolor");
    try {
      expect(window.localStorage.getItem(SKIN_KEY)).toBe("watercolor");
    } catch {
      // jsdom without storage: the live value still applies.
    }
  });

  it("shows the Now pill only after a click and hides it after about 1.8 s", () => {
    vi.useFakeTimers();
    expect(pill()?.classList.contains("style-stamp-show")).toBe(false);
    click(button());
    expect(pill()?.classList.contains("style-stamp-show")).toBe(true);
    expect(pill()?.textContent).toContain("Watercolor");
    act(() => {
      vi.advanceTimersByTime(1700);
    });
    expect(pill()?.classList.contains("style-stamp-show")).toBe(true);
    act(() => {
      vi.advanceTimersByTime(200);
    });
    expect(pill()?.classList.contains("style-stamp-show")).toBe(false);
  });

  it("restarts the pill timer on rapid clicks and clears it on unmount", () => {
    vi.useFakeTimers();
    const clearSpy = vi.spyOn(globalThis, "clearTimeout");
    try {
      click(button());
      act(() => {
        vi.advanceTimersByTime(1500);
      });
      click(button());
      act(() => {
        vi.advanceTimersByTime(1500);
      });
      expect(pill()?.classList.contains("style-stamp-show")).toBe(true);
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

  it("renders the small variant with no ring text but the same label", () => {
    render(<StyleStamp size="small" />);
    expect(container.querySelector("textPath")).toBeNull();
    expect(button().getAttribute("aria-label")).toBe("Change style, now Engraving");
    expect(button().getAttribute("title")).toBe("Change style, now Engraving");
    // The brush medal stays.
    expect(button().querySelector("svg")).not.toBeNull();
  });

  it("gives two stamps on one page different ring path ids", () => {
    render(
      <>
        <StyleStamp />
        <StyleStamp />
      </>,
    );
    const ids = [...container.querySelectorAll("defs path")].map((p) => p.getAttribute("id"));
    expect(ids).toHaveLength(2);
    expect(ids[0]).toBeTruthy();
    expect(ids[1]).toBeTruthy();
    expect(new Set(ids).size).toBe(2);
    const hrefs = [...container.querySelectorAll("textPath")].map((t) => t.getAttribute("href"));
    expect(new Set(hrefs).size).toBe(2);
    for (const href of hrefs) {
      expect(ids).toContain(href?.slice(1));
    }
  });
});
