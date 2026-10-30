/**
 * @vitest-environment jsdom
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { TopLine } from "./chrome";

(globalThis as unknown as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root | null = null;

beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  act(() => {
    root = createRoot(container);
    root.render(
      <TopLine
        bookTitle="The Wonderful Wizard of Oz"
        author="L. Frank Baum"
        ch={1}
        chaptersTotal={2}
        chapters={[
          { ch: 1, title: "The Cyclone" },
          { ch: 2, title: "The Council" },
        ]}
        onJumpChapter={() => {}}
        theme="light"
        onToggleTheme={() => {}}
      />,
    );
  });
});

afterEach(() => {
  act(() => root?.unmount());
  root = null;
  container.remove();
});

describe("reader wordmark", () => {
  it("is the one link back to the shelf", () => {
    const links = container.querySelectorAll<HTMLAnchorElement>('a[aria-label="Back to the shelf"]');
    expect(links).toHaveLength(1);
    expect(links[0]?.getAttribute("href")).toBe("/");
    expect(links[0]?.classList.contains("wordmark")).toBe(true);
    expect(links[0]?.querySelector(".wm-brand")?.textContent).toBe("LectorIA");
    expect(container.textContent).not.toContain("Shelf");
  });

  it("swaps to a hidden 'Back to shelf' face that screen readers skip", () => {
    const back = container.querySelector(".wordmark-home .wm-back");
    expect(back?.textContent?.trim()).toBe("Back to shelf");
    expect(back?.getAttribute("aria-hidden")).toBe("true");
  });
});
