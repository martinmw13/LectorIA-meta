// @vitest-environment jsdom
// The text view mounts late on a chapter's first scene (cover first),
// so the mouseup listener must attach when the view appears, not on
// first render.
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, test, vi } from "vitest";
import { usePictures } from "./use-pictures";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let lastPopover: unknown = "unset";

function Harness({ showText }: { showText: boolean }) {
  const pic = usePictures({ bookId: "oz", textVersion: "v", sceneId: "c1s1", pref: { kind: "preset", id: "denslow" } });
  lastPopover = pic.popover;
  if (!showText) return <div data-testid="cover">cover</div>;
  return (
    <div ref={pic.viewRef}>
      <p id="c1p1" data-n="1">
        Dorothy lived in Kansas.
      </p>
    </div>
  );
}

afterEach(() => {
  document.body.innerHTML = "";
  window.getSelection()?.removeAllRanges();
  vi.unstubAllGlobals();
});

test("selection popover attaches when the text view mounts late", () => {
  vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => {
    cb(0);
    return 0;
  });
  // jsdom ranges have no layout; the hook only reads the rect numbers.
  Range.prototype.getBoundingClientRect ??= () => new DOMRect(10, 20, 100, 16);
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  act(() => {
    root.render(<Harness showText={false} />);
  });
  act(() => {
    root.render(<Harness showText={true} />);
  });
  const p = host.querySelector("p");
  expect(p?.firstChild).not.toBeNull();
  const range = document.createRange();
  range.selectNodeContents(p!.firstChild!);
  const sel = window.getSelection()!;
  sel.removeAllRanges();
  sel.addRange(range);
  act(() => {
    host.querySelector("div")!.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }));
  });
  expect(lastPopover).not.toBeNull();
  act(() => {
    root.unmount();
  });
});
