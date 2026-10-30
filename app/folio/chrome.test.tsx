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

describe("reader shelf link", () => {
  it("renders a back-to-shelf link to /", () => {
    const link = container.querySelector<HTMLAnchorElement>('a[aria-label="Back to the shelf"]');
    expect(link).not.toBeNull();
    expect(link?.getAttribute("href")).toBe("/");
    expect(link?.textContent).toContain("Shelf");
  });
});
