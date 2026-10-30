// @vitest-environment jsdom
// Passage selection without a mouse: pointerup and a debounced
// selectionchange rescan like mouseup does, repeats paint once, and every
// listener is removed on unmount.
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { DEFAULT_IMAGE_STYLE } from "../image-style";
import { usePictures } from "./use-pictures";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

type Hook = ReturnType<typeof usePictures>;
let seen: Hook[] = [];

function Probe() {
  const h = usePictures({ bookId: "b", textVersion: "v", sceneId: "c1s1", pref: DEFAULT_IMAGE_STYLE });
  seen.push(h);
  return (
    <div ref={h.viewRef}>
      <p id="p1" data-n="1">
        The cyclone had set the house down gently.
      </p>
    </div>
  );
}

beforeEach(() => {
  seen = [];
  vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => {
    cb(0);
    return 1;
  });
  vi.stubGlobal("cancelAnimationFrame", () => {});
  // jsdom ranges have no geometry; the hook only reads the rect.
  Range.prototype.getBoundingClientRect ??= () => new DOMRect(0, 0, 10, 10);
});

const roots: Root[] = [];
afterEach(async () => {
  for (const root of roots.splice(0)) await act(async () => root.unmount());
  vi.unstubAllGlobals();
  vi.useRealTimers();
  document.body.innerHTML = "";
});

async function mount(): Promise<{ host: HTMLElement; view: HTMLElement }> {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  roots.push(root);
  await act(async () => {
    root.render(<Probe />);
  });
  return { host, view: host.firstElementChild as HTMLElement };
}

function selectText(start: number, end: number): void {
  const text = document.querySelector("#p1")?.firstChild;
  if (!text) throw new Error("no text");
  const range = document.createRange();
  range.setStart(text, start);
  range.setEnd(text, end);
  const sel = window.getSelection();
  sel?.removeAllRanges();
  sel?.addRange(range);
}

const popover = (): unknown => seen[seen.length - 1]?.popover ?? null;

test("pointerup shows the popover; a repeat mouseup paints nothing new", async () => {
  const { view } = await mount();
  selectText(0, 10);
  await act(async () => {
    view.dispatchEvent(new Event("pointerup", { bubbles: true }));
  });
  const first = popover();
  expect(first).not.toBeNull();
  await act(async () => {
    view.dispatchEvent(new Event("mouseup", { bubbles: true }));
  });
  expect(popover()).toBe(first);
});

test("a debounced selectionchange covers keyboard selections", async () => {
  vi.useFakeTimers();
  const { view } = await mount();
  expect(view).not.toBeNull();
  selectText(4, 14);
  await act(async () => {
    document.dispatchEvent(new Event("selectionchange"));
  });
  expect(popover()).toBeNull();
  await act(async () => {
    vi.advanceTimersByTime(250);
  });
  expect(popover()).not.toBeNull();
});

test("hidePopover clears the dedupe so the same selection reshows the popover", async () => {
  const { view } = await mount();
  selectText(0, 10);
  await act(async () => {
    view.dispatchEvent(new Event("pointerup", { bubbles: true }));
  });
  expect(popover()).not.toBeNull();
  await act(async () => {
    seen[seen.length - 1]?.hidePopover();
  });
  expect(popover()).toBeNull();
  await act(async () => {
    view.dispatchEvent(new Event("pointerup", { bubbles: true }));
  });
  expect(popover()).not.toBeNull();
});

test("Escape clears the dedupe so the same selection reshows the popover", async () => {
  const { view } = await mount();
  selectText(0, 10);
  await act(async () => {
    view.dispatchEvent(new Event("pointerup", { bubbles: true }));
  });
  expect(popover()).not.toBeNull();
  await act(async () => {
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
  });
  expect(popover()).toBeNull();
  await act(async () => {
    view.dispatchEvent(new Event("pointerup", { bubbles: true }));
  });
  expect(popover()).not.toBeNull();
});

test("unmount removes every selection listener", async () => {
  const { host, view } = await mount();
  const viewRemove = vi.spyOn(view, "removeEventListener");
  const docRemove = vi.spyOn(document, "removeEventListener");
  const root = roots[roots.length - 1];
  if (!root) throw new Error("no root");
  await act(async () => {
    root.unmount();
  });
  roots.pop();
  host.remove();
  expect(viewRemove).toHaveBeenCalledWith("mouseup", expect.any(Function));
  expect(viewRemove).toHaveBeenCalledWith("pointerup", expect.any(Function));
  expect(docRemove).toHaveBeenCalledWith("selectionchange", expect.any(Function));
});
