// DOM range mapping for read-along highlight: word timings are
// paragraph-relative, while the page renders fragments cut by
// paginateScene. Cut points land on spaces, so a word never straddles
// fragments; each fragment carries its start in data-from. planRanges is
// pure (offsets in, offsets out) and unit-tested; rangesForChunk applies
// a plan to the live text nodes.
import type { ChapterNarration } from "@/core/narration";

type Chunk = ChapterNarration["chunks"][number];

export interface PlannedFragment {
  from: number;
  len: number;
}

export interface PlannedWord {
  frag: number;
  start: number;
  end: number;
}

export interface PlannedRanges {
  word: PlannedWord | null;
  sentence: PlannedWord[];
}

export function planRanges(
  frags: PlannedFragment[],
  chunk: Pick<Chunk, "start" | "end" | "w">,
  wordIdx: number,
): PlannedRanges {
  const sentence: PlannedWord[] = [];
  frags.forEach((frag, index) => {
    const start = Math.max(chunk.start, frag.from);
    const end = Math.min(chunk.end, frag.from + frag.len);
    if (end > start) sentence.push({ frag: index, start: start - frag.from, end: end - frag.from });
  });
  let word: PlannedWord | null = null;
  // The active word is a chunk-global index; the holding fragment is the
  // one whose span contains its paragraph-relative start.
  const abs = wordIdx >= 0 ? (chunk.w[wordIdx * 4] as number | undefined) : undefined;
  if (abs !== undefined) {
    const end = chunk.w[wordIdx * 4 + 1] as number;
    const at = frags.findIndex((frag) => abs >= frag.from && abs < frag.from + frag.len);
    if (at >= 0) {
      const frag = frags[at] as PlannedFragment;
      word = { frag: at, start: abs - frag.from, end: Math.min(end - frag.from, frag.len) };
    }
  }
  return { word, sentence };
}

export interface SpotRanges {
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
  const nodes = [...container.querySelectorAll(`p[data-n="${chunk.n}"]`)];
  const texts: (Text | null)[] = nodes.map(firstTextChild);
  const frags: PlannedFragment[] = nodes.map((p, i) => ({
    from: Number(p.getAttribute("data-from") ?? 0),
    len: texts[i]?.length ?? 0,
  }));
  const plan = planRanges(frags, chunk, wordIdx);
  const sentence: Range[] = [];
  for (const part of plan.sentence) {
    const text = texts[part.frag];
    if (!text) continue;
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
    const text = texts[plan.word.frag];
    if (text) {
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
  }
  return { word, wordText, sentence };
}
