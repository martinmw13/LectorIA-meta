// DOM range mapping for read-along highlight: word timings are
// paragraph-relative char offsets, and the column renders each
// paragraph whole in `p[data-n]`. planRanges is pure (offsets in,
// offsets out) and unit-tested; rangesForChunk applies a plan to the
// live text node.
import type { ChapterNarration } from "@/core/narration";

type Chunk = ChapterNarration["chunks"][number];

export interface PlannedWord {
  start: number;
  end: number;
}

export interface PlannedRanges {
  word: PlannedWord | null;
  sentence: PlannedWord[];
}

export function planRanges(
  textLen: number,
  chunk: Pick<Chunk, "start" | "end" | "w">,
  wordIdx: number,
): PlannedRanges {
  const sentence: PlannedWord[] = [];
  const start = Math.max(chunk.start, 0);
  const end = Math.min(chunk.end, textLen);
  if (end > start) sentence.push({ start, end });
  let word: PlannedWord | null = null;
  // The active word is a chunk-global index; its paragraph-relative
  // offsets come straight from the timings.
  const abs = wordIdx >= 0 ? (chunk.w[wordIdx * 4] as number | undefined) : undefined;
  if (abs !== undefined && abs >= 0 && abs < textLen) {
    const end = chunk.w[wordIdx * 4 + 1] as number;
    word = { start: abs, end: Math.min(end, textLen) };
  }
  return { word, sentence };
}

export interface SpotRanges {
  para: HTMLElement | null;
  word: Range | null;
  wordText: string;
  sentence: Range[];
}

function firstTextChild(p: Element): Text | null {
  for (const node of p.childNodes) {
    if (node.nodeType === 3) return node as Text;
  }
  return null;
}

export function rangesForChunk(container: HTMLElement, chunk: Chunk, wordIdx: number): SpotRanges {
  const para = container.querySelector(`p[data-n="${chunk.n}"]`);
  if (!(para instanceof HTMLElement)) return { para: null, word: null, wordText: "", sentence: [] };
  const text = firstTextChild(para);
  if (!text) return { para, word: null, wordText: "", sentence: [] };
  const plan = planRanges(text.length, chunk, wordIdx);
  const sentence: Range[] = [];
  for (const part of plan.sentence) {
    try {
      const r = document.createRange();
      r.setStart(text, part.start);
      r.setEnd(text, part.end);
      sentence.push(r);
    } catch {
      // A split text node keeps the sentence tint partial.
    }
  }
  let word: Range | null = null;
  let wordText = "";
  if (plan.word) {
    try {
      const r = document.createRange();
      r.setStart(text, plan.word.start);
      r.setEnd(text, plan.word.end);
      word = r;
      wordText = r.toString();
    } catch {
      word = null;
    }
  }
  return { para, word, wordText, sentence };
}
