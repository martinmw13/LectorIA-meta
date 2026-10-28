// @vitest-environment jsdom
// The text view mounts late on a chapter's first scene (cover first),
// so the mouseup listener must attach when the view appears, not on
// first render.
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, test, vi } from "vitest";
import { SelectionPopover } from "./inline-figures";
import { popoverPos, usePictures } from "./use-pictures";

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

test("popover position is document-based, not view-relative", () => {
  expect(popoverPos({ top: 20, left: 10, width: 100 }, { x: 0, y: 0 })).toEqual({ top: 12, left: 60 });
  expect(popoverPos({ top: 20, left: 10, width: 100 }, { x: 30, y: 400 })).toEqual({
    top: 412,
    left: 90,
  });
});

function PortalHarness() {
  const pic = usePictures({ bookId: "oz", textVersion: "v", sceneId: "c9s9", pref: { kind: "preset", id: "denslow" } });
  lastPopover = pic.popover;
  return (
    <div ref={pic.viewRef}>
      <p id="c9p1" data-n="1">
        The cyclone spun over the gray prairie.
      </p>
      {pic.popover !== null ? (
        <SelectionPopover pos={pic.popover} popRef={pic.popRef} onPick={() => {}} />
      ) : null}
    </div>
  );
}

// The popover portals into document.body at document coordinates, so it
// stays on the selection however the reader lays scenes out.
test("selection popover portals to the body and hides on resize", () => {
  vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => {
    cb(0);
    return 0;
  });
  Range.prototype.getBoundingClientRect = () => new DOMRect(10, 20, 100, 16);
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  act(() => {
    root.render(<PortalHarness />);
  });
  const p = host.querySelector("p");
  const range = document.createRange();
  range.selectNodeContents(p!.firstChild!);
  const sel = window.getSelection()!;
  sel.removeAllRanges();
  sel.addRange(range);
  act(() => {
    host.querySelector("div")!.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }));
  });
  expect(lastPopover).toEqual({ top: 12, left: 60 });
  const pill = document.body.querySelector(".picture-float") as HTMLElement | null;
  expect(pill).not.toBeNull();
  expect(host.querySelector(".picture-float")).toBeNull();
  expect(pill?.style.top).toBe("12px");
  expect(pill?.style.left).toBe("60px");
  // An inner scroll container moving the text moves the pill with it.
  Range.prototype.getBoundingClientRect = () => new DOMRect(10, -80, 100, 16);
  act(() => {
    host.querySelector("div")!.dispatchEvent(new Event("scroll"));
  });
  expect(lastPopover).toEqual({ top: -88, left: 60 });
  act(() => {
    window.dispatchEvent(new Event("resize"));
  });
  expect(lastPopover).toBeNull();
  expect(document.body.querySelector(".picture-float")).toBeNull();
  act(() => {
    root.unmount();
  });
});

let lastRescan: (() => void) | null = null;

function SceneHarness({ sceneId }: { sceneId: string }) {
  const pic = usePictures({ bookId: "oz", textVersion: "v", sceneId, pref: { kind: "preset", id: "denslow" } });
  lastPopover = pic.popover;
  lastRescan = pic.rescan;
  return (
    <div ref={pic.viewRef}>
      <p id="c2p1" data-n="1">
        The house whirled around two or three times.
      </p>
    </div>
  );
}

// Continuous scroll: a selection that starts in another scene switches the
// current scene, then rescans. The switch must not drop the popover.
test("rescan after a scene switch shows the popover at document coordinates", () => {
  Range.prototype.getBoundingClientRect = () => new DOMRect(10, 20, 100, 16);
  vi.stubGlobal("scrollY", 300);
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  act(() => {
    root.render(<SceneHarness sceneId="c2s1" />);
  });
  const range = document.createRange();
  range.selectNodeContents(host.querySelector("p")!.firstChild!);
  const sel = window.getSelection()!;
  sel.removeAllRanges();
  sel.addRange(range);
  act(() => {
    root.render(<SceneHarness sceneId="c2s2" />);
  });
  act(() => {
    lastRescan?.();
  });
  expect(lastPopover).toEqual({ top: 312, left: 60 });
  act(() => {
    root.unmount();
  });
});
