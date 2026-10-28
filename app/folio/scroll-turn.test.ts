import { describe, expect, it } from "vitest";
import { edges, readOnLabel, wheelTurn } from "./scroll-turn";
import type { WheelTurnState } from "./scroll-turn";

const fresh = (): WheelTurnState => ({ acc: 0, lockedUntil: 0, lastAt: 0 });
const bottom = { atTop: false, atBottom: true };
const top = { atTop: true, atBottom: false };
const middle = { atTop: false, atBottom: false };

describe("wheelTurn", () => {
  it("turns next once on a down wheel at the bottom", () => {
    const first = wheelTurn(fresh(), { deltaY: 70, deltaMode: 0, now: 1000, ...bottom });
    expect(first.turn).toBe("next");
    const second = wheelTurn(first.state, { deltaY: 70, deltaMode: 0, now: 1016, ...bottom });
    expect(second.turn).toBeNull();
  });

  it("ignores a long inertia train of small deltas after a turn", () => {
    let state = wheelTurn(fresh(), { deltaY: 80, deltaMode: 0, now: 1000, ...bottom }).state;
    for (let i = 1; i <= 40; i++) {
      const next = wheelTurn(state, { deltaY: 12, deltaMode: 0, now: 1000 + i * 16, ...bottom });
      expect(next.turn).toBeNull();
      state = next.state;
    }
  });

  it("turns again after a 300 ms quiet gap", () => {
    let state = wheelTurn(fresh(), { deltaY: 80, deltaMode: 0, now: 1000, ...bottom }).state;
    state = wheelTurn(state, { deltaY: 10, deltaMode: 0, now: 1100, ...bottom }).state;
    const next = wheelTurn(state, { deltaY: 70, deltaMode: 0, now: 1400, ...bottom });
    expect(next.turn).toBe("next");
  });

  it("never turns scrolling down away from the bottom and keeps acc at 0", () => {
    let state = fresh();
    for (let i = 0; i < 5; i++) {
      const next = wheelTurn(state, { deltaY: 200, deltaMode: 0, now: 1000 + i * 16, ...middle });
      expect(next.turn).toBeNull();
      expect(next.state.acc).toBe(0);
      state = next.state;
    }
  });

  it("turns prev on an up wheel at the top", () => {
    const prev = wheelTurn(fresh(), { deltaY: -70, deltaMode: 0, now: 1000, ...top });
    expect(prev.turn).toBe("prev");
  });

  it("scales line deltas: 4 lines turn, 3 lines do not", () => {
    const small = wheelTurn(fresh(), { deltaY: 3, deltaMode: 1, now: 1000, ...bottom });
    expect(small.turn).toBeNull();
    const big = wheelTurn(fresh(), { deltaY: 4, deltaMode: 1, now: 1000, ...bottom });
    expect(big.turn).toBe("next");
  });

  it("accumulates small swipes and resets on flip or a stale gap", () => {
    let state = wheelTurn(fresh(), { deltaY: 30, deltaMode: 0, now: 1000, ...bottom }).state;
    const summed = wheelTurn(state, { deltaY: 35, deltaMode: 0, now: 1050, ...bottom });
    expect(summed.turn).toBe("next");

    state = wheelTurn(fresh(), { deltaY: 50, deltaMode: 0, now: 1000, ...bottom }).state;
    const flipped = wheelTurn(state, { deltaY: -30, deltaMode: 0, now: 1050, ...top });
    expect(flipped.turn).toBeNull();
    expect(flipped.state.acc).toBe(-30);

    state = wheelTurn(fresh(), { deltaY: 50, deltaMode: 0, now: 1000, ...bottom }).state;
    const stale = wheelTurn(state, { deltaY: 50, deltaMode: 0, now: 1300, ...bottom });
    expect(stale.turn).toBeNull();
    expect(stale.state.acc).toBe(50);
  });
});

describe("edges", () => {
  const el = (scrollTop: number, scrollHeight: number, clientHeight: number) =>
    ({ scrollTop, scrollHeight, clientHeight }) as HTMLElement;

  it("reports both edges when the column fits without scrolling", () => {
    expect(edges(el(0, 400, 500))).toEqual({ atTop: true, atBottom: true });
  });

  it("reports one edge at a time with a 2 px tolerance", () => {
    expect(edges(el(0, 1000, 500))).toEqual({ atTop: true, atBottom: false });
    expect(edges(el(500, 1000, 500))).toEqual({ atTop: false, atBottom: true });
    expect(edges(el(499, 1000, 500))).toEqual({ atTop: false, atBottom: true });
    expect(edges(el(250, 1000, 500))).toEqual({ atTop: false, atBottom: false });
  });
});

describe("readOnLabel", () => {
  it("invites a page turn while text pages follow", () => {
    expect(
      readOnLabel({ textIndex: 0, textCount: 3, hasEndPage: false, hasNextSceneInChapter: true, ch: 1 }),
    ).toBe("Turn the page ↓");
  });

  it("points at the next scene on the last text page mid-chapter", () => {
    expect(
      readOnLabel({ textIndex: 2, textCount: 3, hasEndPage: false, hasNextSceneInChapter: true, ch: 1 }),
    ).toBe("Next scene ↓");
  });

  it("closes the chapter when the end page comes next", () => {
    expect(
      readOnLabel({ textIndex: 2, textCount: 3, hasEndPage: true, hasNextSceneInChapter: false, ch: 2 }),
    ).toBe("Finish Chapter 2 ↓");
  });

  it("hides at the very end of the book", () => {
    expect(
      readOnLabel({ textIndex: 0, textCount: 1, hasEndPage: false, hasNextSceneInChapter: false, ch: 24 }),
    ).toBeNull();
  });
});
