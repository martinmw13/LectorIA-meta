// Scene coverage validators. Problems are data, not throws, so the
// caller can paste them into the retry prompt and then fail loudly.
import type { Book, Chapter, Scene, SceneInput } from "./types";

export interface CoverageProblem {
  code: "gap" | "overlap" | "bad-start" | "bad-end" | "order" | "cross-chapter" | "out-of-range";
  message: string;
}

export function validateSceneCoverage(chapter: Chapter, scenes: SceneInput[]): CoverageProblem[] {
  const problems: CoverageProblem[] = [];
  if (scenes.length === 0) {
    problems.push({ code: "gap", message: `chapter ${chapter.ch} has no scenes` });
    return problems;
  }
  const first = scenes[0];
  if (first && first.start_n !== chapter.start_n) {
    problems.push({
      code: "bad-start",
      message: `first scene starts at ${first.start_n}, chapter starts at ${chapter.start_n}`,
    });
  }
  scenes.forEach((scene, i) => {
    if (scene.start_n < chapter.start_n || scene.end_n > chapter.end_n) {
      problems.push({
        code: "out-of-range",
        message: `scene ${i} [${scene.start_n}..${scene.end_n}] outside chapter [${chapter.start_n}..${chapter.end_n}]`,
      });
    }
    if (scene.start_n > scene.end_n) {
      problems.push({ code: "order", message: `scene ${i} starts after it ends` });
    }
    if (i === 0) return;
    const prev = scenes[i - 1];
    if (prev && scene.start_n === prev.end_n + 1) return;
    if (prev && scene.start_n <= prev.end_n) {
      problems.push({ code: "overlap", message: `scene ${i} starts at ${scene.start_n} inside previous scene ending at ${prev.end_n}` });
    } else if (prev) {
      problems.push({ code: "gap", message: `gap between scene ${i - 1} ending at ${prev.end_n} and scene ${i} starting at ${scene.start_n}` });
    }
  });
  const last = scenes[scenes.length - 1];
  if (last && last.end_n !== chapter.end_n) {
    problems.push({
      code: "bad-end",
      message: `last scene ends at ${last.end_n}, chapter ends at ${chapter.end_n}`,
    });
  }
  return problems;
}

// Whole book check: no scene crosses a chapter, and the union covers
// every paragraph exactly once.
export function validateBookCoverage(
  book: Pick<Book, "chapters" | "paragraphs">,
  scenes: Scene[],
): CoverageProblem[] {
  const problems: CoverageProblem[] = [];
  const byCh = new Map(book.chapters.map((c) => [c.ch, c]));
  const total = book.paragraphs.length;
  const seen = new Array<boolean>(total + 1).fill(false);
  for (const scene of scenes) {
    const chapter = byCh.get(scene.ch);
    if (!chapter) {
      problems.push({ code: "cross-chapter", message: `scene ${scene.id} names unknown chapter ${scene.ch}` });
      continue;
    }
    if (scene.start_n < chapter.start_n || scene.end_n > chapter.end_n) {
      problems.push({ code: "cross-chapter", message: `scene ${scene.id} crosses chapter ${scene.ch} bounds` });
    }
    for (let n = scene.start_n; n <= scene.end_n; n++) {
      if (n < 1 || n > total) {
        problems.push({ code: "out-of-range", message: `scene ${scene.id} covers ordinal ${n} outside 1..${total}` });
        continue;
      }
      if (seen[n]) {
        problems.push({ code: "overlap", message: `ordinal ${n} covered twice` });
      }
      seen[n] = true;
    }
  }
  for (let n = 1; n <= total; n++) {
    if (!seen[n]) problems.push({ code: "gap", message: `ordinal ${n} covered by no scene` });
  }
  return problems;
}
