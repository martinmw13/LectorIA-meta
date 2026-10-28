// Node environment on purpose: these helpers touch only a tiny DOM
// surface (querySelector, getBoundingClientRect, listeners), so plain
// fakes keep the test runnable without jsdom.
import { afterEach, describe, expect, test, vi } from "vitest";
import {
  attachFollowPause,
  followIntoView,
  noteUserScroll,
  pickCurrentScene,
  scrollToSceneId,
} from "./scroll-helpers";

function vis(id: string, ratio: number): [string, { id: string; ratio: number }] {
  return [id, { id, ratio }];
}

describe("pickCurrentScene", () => {
  test("picks the largest ratio", () => {
    expect(pickCurrentScene(["a", "b"], new Map([vis("a", 0.2), vis("b", 0.8)]))).toBe("b");
  });

  test("ties keep document order", () => {
    expect(pickCurrentScene(["a", "b"], new Map([vis("a", 0.5), vis("b", 0.5)]))).toBe("a");
  });

  test("ignores sections that are not visible", () => {
    expect(pickCurrentScene(["a", "b"], new Map([vis("a", 0), vis("b", 0.1)]))).toBe("b");
    expect(pickCurrentScene(["a", "b"], new Map())).toBeNull();
    expect(pickCurrentScene(["a", "b"], new Map([vis("a", 0)]))).toBeNull();
  });

  test("a section missing from the map never wins", () => {
    expect(pickCurrentScene(["a", "b"], new Map([vis("b", 0.3)]))).toBe("b");
    expect(pickCurrentScene(["a", "c"], new Map([vis("b", 0.9)]))).toBeNull();
  });
});

function fakeScroller(sections: Record<string, object>): {
  scroller: HTMLElement;
  seen: ScrollIntoViewOptions[];
} {
  const seen: ScrollIntoViewOptions[] = [];
  const nodes: Record<string, object> = {};
  for (const [id, node] of Object.entries(sections)) nodes[id] = node;
  const scroller = {
    querySelector(sel: string) {
      const m = /\[data-scene-id="([^"]+)"\]/.exec(sel);
      const el = m ? nodes[m[1] as string] : undefined;
      if (!el) return null;
      return { scrollIntoView: (options: ScrollIntoViewOptions) => seen.push(options) };
    },
  } as unknown as HTMLElement;
  return { scroller, seen };
}

describe("scrollToSceneId", () => {
  test("scrolls the section into view and reports missing ids", () => {
    const { scroller, seen } = fakeScroller({ c1s1: {} });
    expect(scrollToSceneId(scroller, "c1s1")).toBe(true);
    expect(seen).toHaveLength(1);
    expect(seen[0]?.block).toBe("start");
    expect(scrollToSceneId(scroller, "c9s9")).toBe(false);
  });
});

function box(top: number, height: number): DOMRect {
  return { top, bottom: top + height, height } as DOMRect;
}

function fakeEl(top: number, height: number): HTMLElement {
  return { getBoundingClientRect: () => box(top, height) } as unknown as HTMLElement;
}

function fakeCol(top: number, height: number, scrollTop = 0): HTMLElement {
  return {
    scrollTop,
    getBoundingClientRect: () => box(top, height),
    addEventListener: () => {},
    removeEventListener: () => {},
  } as unknown as HTMLElement;
}

describe("followIntoView", () => {
  test("leaves elements inside the band alone", () => {
    const scroller = fakeCol(0, 1000);
    expect(followIntoView(fakeEl(400, 20), scroller, 10_000)).toBe(false);
    expect(scroller.scrollTop).toBe(0);
  });

  test("scrolls elements above or below the band into it", () => {
    const scroller = fakeCol(0, 1000);
    expect(followIntoView(fakeEl(50, 20), scroller, 10_000)).toBe(true);
    expect(scroller.scrollTop).toBe(-150);
    scroller.scrollTop = 0;
    expect(followIntoView(fakeEl(900, 20), scroller, 10_000)).toBe(true);
    expect(scroller.scrollTop).toBe(120);
  });

  test("pauses after a user scroll", () => {
    const scroller = fakeCol(0, 1000);
    const el = fakeEl(50, 20);
    noteUserScroll(scroller, 10_000);
    expect(followIntoView(el, scroller, 10_000 + 3999)).toBe(false);
    expect(followIntoView(el, scroller, 10_000 + 4000)).toBe(true);
  });

  test("attachFollowPause marks user scrolls from listeners", () => {
    const handlers: Record<string, () => void> = {};
    const scroller = {
      scrollTop: 0,
      getBoundingClientRect: () => box(0, 1000),
      addEventListener: (name: string, fn: () => void) => {
        handlers[name] = fn;
      },
      removeEventListener: vi.fn(),
    } as unknown as HTMLElement;
    vi.stubGlobal("window", { addEventListener: () => {}, removeEventListener: () => {} });
    const detach = attachFollowPause(scroller);
    handlers["wheel"]?.();
    // A wheel just happened, so the follow must pause even though the
    // element sits outside the band.
    expect(followIntoView(fakeEl(50, 20), scroller, Date.now())).toBe(false);
    detach();
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});
