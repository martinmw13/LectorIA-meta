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

function glidingCol(): { scroller: HTMLElement; frames: Array<(now: number) => void>; cancelled: number[] } {
  const frames: Array<(now: number) => void> = [];
  const cancelled: number[] = [];
  const view = {
    performance: { now: () => 0 },
    requestAnimationFrame: (fn: (now: number) => void) => frames.push(fn),
    cancelAnimationFrame: (id: number) => void cancelled.push(id),
  };
  const scroller = Object.assign(fakeCol(0, 1000), { ownerDocument: { defaultView: view } });
  return { scroller, frames, cancelled };
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

  test("brings elements above the band or past 60% back to 38%", () => {
    const scroller = fakeCol(0, 1000, 1000);
    expect(followIntoView(fakeEl(50, 20), scroller, 10_000)).toBe(true);
    expect(scroller.scrollTop).toBe(670);
    const fresh = fakeCol(0, 1000);
    expect(followIntoView(fakeEl(590, 20), fresh, 10_000)).toBe(true);
    expect(fresh.scrollTop).toBe(210);
  });

  test("never scrolls above the top", () => {
    const scroller = fakeCol(0, 1000);
    expect(followIntoView(fakeEl(50, 20), scroller, 10_000)).toBe(false);
    expect(scroller.scrollTop).toBe(0);
  });

  test("glides there over several frames, judged against its target so frames never stack", () => {
    const { scroller, frames, cancelled } = glidingCol();
    // The glide has not stepped yet: the word still reads at 900.
    expect(followIntoView(fakeEl(900, 20), scroller, 10_000)).toBe(true);
    expect(followIntoView(fakeEl(900, 20), scroller, 10_016)).toBe(true);
    expect(followIntoView(fakeEl(930, 20), scroller, 10_032)).toBe(true);
    expect(frames).toHaveLength(1);
    expect(cancelled).toHaveLength(0);
    const seen: number[] = [];
    for (let t = 0; frames.length > 0 && t < 100; t++) {
      const step = frames.shift() as (now: number) => void;
      step((t + 1) * 100);
      seen.push(scroller.scrollTop);
    }
    // Steady: several small eased steps that only move forward.
    expect(seen.length).toBeGreaterThan(4);
    expect(seen.every((v, i) => i === 0 || v >= (seen[i - 1] as number))).toBe(true);
    expect(seen.at(-1)).toBe(520);
  });

  test("a user scroll stops a glide mid-way", () => {
    const { scroller, frames, cancelled } = glidingCol();
    expect(followIntoView(fakeEl(900, 20), scroller, 10_000)).toBe(true);
    noteUserScroll(scroller, 10_100);
    expect(cancelled).toHaveLength(1);
    expect(frames).toHaveLength(1);
  });

  test("a box taller than the band follows its top and never tugs back down", () => {
    const scroller = fakeCol(0, 1000);
    // Top inside the band, bottom far below: the old rule scrolled it
    // down, then up on the next frame, over and over.
    expect(followIntoView(fakeEl(300, 1400), scroller, 10_000)).toBe(false);
    expect(scroller.scrollTop).toBe(0);
  });

  test("pauses after a user scroll", () => {
    const scroller = fakeCol(0, 1000);
    const el = fakeEl(900, 20);
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
