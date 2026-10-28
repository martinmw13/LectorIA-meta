// Resplit rule: split a scene only where the dominant emotion changes
// strongly and stays changed along the text. Pure, no network.
import { EMOTIONS } from "./types";
import type { EmotionId, Vector8 } from "./types";
import { countWords } from "./reader";

export const RESPLIT_AUTO_MARGIN = 0.3;
export const RESPLIT_ASK_MARGIN = 0.15;
export const RESPLIT_MIN_PART_WORDS = 120;
export const RESPLIT_MIN_SCENE_WORDS = 240;
export const RESPLIT_CANDIDATE_WORDS = 350;
export const RESPLIT_LOW_TOP = 0.5;
export const RESPLIT_LOW_GAP = 0.15;
export const RESPLIT_WINDOW_MIN = 100;
export const RESPLIT_WINDOW_MAX = 160;

export interface ResplitParagraph {
  n: number;
  text: string;
}

export interface ResplitWindow {
  startN: number;
  endN: number;
  words: number;
  vector: Vector8;
}

export type WindowSpan = Pick<ResplitWindow, "startN" | "endN" | "words">;

export interface SplitCall {
  index: number;
  margin: number;
  left: EmotionId;
  right: EmotionId;
}

export function topOf(vector: Vector8): { id: EmotionId; value: number; gap: number } {
  let id: EmotionId = EMOTIONS[0];
  let value = -Infinity;
  let second = -Infinity;
  for (const key of EMOTIONS) {
    const v = vector[key];
    if (v > value) {
      second = value;
      id = key;
      value = v;
    } else if (v > second) {
      second = v;
    }
  }
  return { id, value, gap: value - second };
}

export function isResplitCandidate(words: number, final: { vector: Vector8 } | null): boolean {
  if (final === null || words < RESPLIT_MIN_SCENE_WORDS) return false;
  if (words > RESPLIT_CANDIDATE_WORDS) return true;
  const { value, gap } = topOf(final.vector);
  return value < RESPLIT_LOW_TOP || gap < RESPLIT_LOW_GAP;
}

// Consecutive windows of whole paragraphs, greedily about 100 to 160
// words each. A single long paragraph is its own window.
export function buildWindows(paragraphs: ResplitParagraph[]): WindowSpan[] {
  const windows: WindowSpan[] = [];
  let startN = 0;
  let endN = 0;
  let words = 0;
  const flush = () => {
    if (words === 0 && endN === 0) return;
    windows.push({ startN, endN, words });
    startN = 0;
    endN = 0;
    words = 0;
  };
  for (const p of paragraphs) {
    if (words >= RESPLIT_WINDOW_MIN) flush();
    if (words === 0) startN = p.n;
    endN = p.n;
    words += countWords(p.text);
  }
  flush();
  const last = windows[windows.length - 1];
  const prev = windows[windows.length - 2];
  if (last && prev && last.words < RESPLIT_WINDOW_MIN) {
    prev.endN = last.endN;
    prev.words += last.words;
    windows.pop();
  }
  return windows;
}

export function meanVector(windows: Pick<ResplitWindow, "words" | "vector">[]): Vector8 {
  const total = windows.reduce((sum, w) => sum + w.words, 0);
  const mean = {} as Vector8;
  for (const id of EMOTIONS) {
    mean[id] = 0;
    for (const w of windows) mean[id] += w.vector[id] * (total > 0 ? w.words / total : 1 / windows.length);
  }
  return mean;
}

// A side holds when it reaches 120 words and the mood persists past
// one short window: two windows, or one window of 120 words itself.
function holds(windows: Pick<ResplitWindow, "words">[]): boolean {
  const words = windows.reduce((sum, w) => sum + w.words, 0);
  if (words < RESPLIT_MIN_PART_WORDS) return false;
  return windows.length >= 2 || (windows[0]?.words ?? 0) >= RESPLIT_MIN_PART_WORDS;
}

export function bestBoundary(windows: ResplitWindow[]): SplitCall | null {
  let best: SplitCall | null = null;
  for (let index = 1; index < windows.length; index++) {
    const leftWindows = windows.slice(0, index);
    const rightWindows = windows.slice(index);
    if (!holds(leftWindows) || !holds(rightWindows)) continue;
    const left = meanVector(leftWindows);
    const right = meanVector(rightWindows);
    const a = topOf(left).id;
    const b = topOf(right).id;
    if (a === b) continue;
    const margin = Math.min(left[a] - left[b], right[b] - right[a]);
    if (best === null || margin > best.margin) best = { index, margin, left: a, right: b };
  }
  return best;
}

export function decideMargin(margin: number): "auto" | "ask" | "none" {
  if (margin >= RESPLIT_AUTO_MARGIN) return "auto";
  if (margin >= RESPLIT_ASK_MARGIN) return "ask";
  return "none";
}

// Binary segmentation: split at the strongest boundary, then recurse
// on each side. The asker resolves ambiguous margins; record keeps
// each taken boundary for provenance.
export async function planSplits(
  windows: ResplitWindow[],
  askSplit: (call: SplitCall) => Promise<boolean>,
  record?: (call: SplitCall, decidedBy: "rule" | "muse") => void,
): Promise<number[]> {
  const best = bestBoundary(windows);
  if (best === null || decideMargin(best.margin) === "none") return [];
  const kind = decideMargin(best.margin);
  if (kind === "ask" && !(await askSplit(best))) return [];
  record?.(best, kind === "ask" ? "muse" : "rule");
  const left = await planSplits(windows.slice(0, best.index), askSplit, record);
  const right = (await planSplits(windows.slice(best.index), askSplit, record)).map((i) => i + best.index);
  return [...left, best.index, ...right];
}

// First part keeps the scene id; later parts add a letter suffix.
export function splitIds(baseId: string, count: number): string[] {
  return Array.from({ length: count }, (_, i) => (i === 0 ? baseId : `${baseId}${String.fromCharCode(97 + i)}`));
}
