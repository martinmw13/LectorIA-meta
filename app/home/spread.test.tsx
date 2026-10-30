// @vitest-environment jsdom
// Shelf links: every ready book's plate reads /read/<id>, and books
// still off the shelf show the coming-soon plate instead. Driven by
// the shelf data, so enabling a book needs no test change.
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { shelf } from "./shelf";
import { HomeSpread } from "./spread";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root | null = null;

function click(el: Element) {
  act(() => {
    el.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
}

function shelfButton(id: string): HTMLButtonElement {
  const el = container.querySelector(`.lb-item[data-book="${id}"]`);
  if (!(el instanceof HTMLButtonElement)) throw new Error(`shelf button missing: ${id}`);
  return el;
}

beforeEach(() => {
  document.body.innerHTML = "";
  container = document.createElement("div");
  document.body.appendChild(container);
  act(() => {
    root = createRoot(container);
  });
  act(() => {
    root?.render(<HomeSpread />);
  });
});

afterEach(() => {
  act(() => {
    root?.unmount();
  });
  root = null;
  container.remove();
});

describe("shelf links", () => {
  test("each ready book starts reading at /read/<id>", () => {
    const ready = shelf.filter((book) => book.ready);
    expect(ready.length).toBeGreaterThan(0);
    for (const book of ready) {
      click(shelfButton(book.id));
      const link = container.querySelector("a.ob-read");
      expect(link?.getAttribute("href")).toBe(`/read/${book.id}`);
    }
  });

  test("every book on the shelf opens its own reader", () => {
    expect(shelf.every((book) => book.ready)).toBe(true);
    for (const book of shelf) {
      click(shelfButton(book.id));
      expect(container.querySelector(".ob-cta-soon")).toBeNull();
      expect(container.querySelector("a.ob-read")?.getAttribute("href")).toBe(`/read/${book.id}`);
    }
  });
});
