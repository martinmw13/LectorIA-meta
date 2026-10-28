// Wheel-to-page-turn logic for the fixed-viewport reader. Pure, no React:
// the scene page feeds wheel events in and turns the page on "next"/"prev".

export interface WheelTurnState {
  acc: number;
  lockedUntil: number;
  lastAt: number;
}

export interface WheelTurnEvent {
  deltaY: number;
  deltaMode: number;
  now: number;
  atTop: boolean;
  atBottom: boolean;
}

export type WheelTurnResult = "next" | "prev" | null;

// WheelEvent deltaMode: 0 pixels, 1 lines, 2 pages.
const LINE_PX = 16;
const PAGE_PX = 800;
// Accumulated pixels that turn one page.
const TURN_PX = 60;
// A gap longer than this starts a fresh swipe.
const SWIPE_GAP_MS = 200;
// After a turn, ignore events until this long passes with no wheel events.
const LOCK_MS = 250;

function toPixels(deltaY: number, deltaMode: number): number {
  if (deltaMode === 1) return deltaY * LINE_PX;
  if (deltaMode === 2) return deltaY * PAGE_PX;
  return deltaY;
}

export function wheelTurn(
  state: WheelTurnState,
  e: WheelTurnEvent,
): { state: WheelTurnState; turn: WheelTurnResult } {
  if (e.now < state.lockedUntil) {
    // Trackpad inertia after a swipe: every event extends the lock, so one
    // swipe never turns twice. The lock ends only after a quiet gap.
    return { state: { acc: 0, lockedUntil: e.now + LOCK_MS, lastAt: e.now }, turn: null };
  }
  const dy = toPixels(e.deltaY, e.deltaMode);
  if (dy === 0) return { state: { ...state, lastAt: e.now }, turn: null };
  const down = dy > 0;
  if ((down && !e.atBottom) || (!down && !e.atTop)) {
    // The column still scrolls natively in this direction; let it.
    return { state: { acc: 0, lockedUntil: state.lockedUntil, lastAt: e.now }, turn: null };
  }
  const fresh =
    state.acc === 0 || Math.sign(state.acc) !== Math.sign(dy) || e.now - state.lastAt > SWIPE_GAP_MS;
  const acc = fresh ? dy : state.acc + dy;
  if (Math.abs(acc) >= TURN_PX) {
    return { state: { acc: 0, lockedUntil: e.now + LOCK_MS, lastAt: e.now }, turn: down ? "next" : "prev" };
  }
  return { state: { acc, lockedUntil: state.lockedUntil, lastAt: e.now }, turn: null };
}

// Reading-column edges with a 2 px tolerance, so sub-pixel rounding and
// smooth-scroll landings still count as resting on the edge.
export function edges(el: HTMLElement): { atTop: boolean; atBottom: boolean } {
  const max = el.scrollHeight - el.clientHeight;
  return { atTop: el.scrollTop <= 2, atBottom: el.scrollTop >= max - 2 };
}

export interface ReadOnInput {
  textIndex: number;
  textCount: number;
  hasEndPage: boolean;
  hasNextSceneInChapter: boolean;
  ch: number;
}

// The continue cue under each text page: which label to show, or null to
// hide at the very end of the book.
export function readOnLabel(input: ReadOnInput): string | null {
  if (input.textIndex < input.textCount - 1) return "Turn the page ↓";
  if (input.hasEndPage) return `Finish Chapter ${input.ch} ↓`;
  if (input.hasNextSceneInChapter) return "Next scene ↓";
  return null;
}
