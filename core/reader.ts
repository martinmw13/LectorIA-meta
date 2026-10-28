// Reader model: the slim shape the client receives. Joins paragraphs to
// scenes by ordinal range in reading order; analysis internals never leave.
import type { AnalyzedScene, Book } from "./types";
import type { Vector8 } from "./types";

export interface ReaderParagraph {
  id: string;
  n: number;
  text: string;
}

export interface ReaderScene {
  id: string;
  title: string;
  emotion: { vector: Vector8; intensity: number; tempo: number } | null;
  paragraphs: ReaderParagraph[];
}

export interface ReaderChapter {
  ch: number;
  title: string;
  scenes: ReaderScene[];
}

export interface ReaderModel {
  bookId: string;
  textVersion: string;
  title: string;
  author: string;
  chapters: ReaderChapter[];
}

// Throws on unordered scenes and on paragraphs covered zero or two times.
export function buildReaderModel(
  book: Pick<Book, "id" | "title" | "author" | "chapters" | "paragraphs" | "textVersion">,
  analysis: { scenes: AnalyzedScene[] },
): ReaderModel {
  const byN = new Map(book.paragraphs.map((p) => [p.n, p]));
  const scenes = [...analysis.scenes];
  for (let i = 1; i < scenes.length; i++) {
    const prev = scenes[i - 1];
    const cur = scenes[i];
    if (prev && cur && (cur.start_n < prev.start_n || (cur.start_n === prev.start_n && cur.end_n < prev.end_n))) {
      throw new Error(`scenes out of order at ${cur.id}`);
    }
  }
  const seen = new Set<number>();
  const sceneParagraphs = new Map<string, ReaderParagraph[]>();
  for (const scene of scenes) {
    const paras: ReaderParagraph[] = [];
    for (let n = scene.start_n; n <= scene.end_n; n++) {
      const p = byN.get(n);
      if (!p) throw new Error(`scene ${scene.id} covers missing ordinal ${n}`);
      if (seen.has(n)) throw new Error(`ordinal ${n} covered twice`);
      seen.add(n);
      paras.push({ id: p.id, n: p.n, text: p.text });
    }
    sceneParagraphs.set(scene.id, paras);
  }
  if (seen.size !== book.paragraphs.length) {
    throw new Error(`coverage gap: ${book.paragraphs.length - seen.size} paragraphs uncovered`);
  }
  const chapters: ReaderChapter[] = book.chapters.map((chapter) => {
    const mine = scenes.filter((s) => s.ch === chapter.ch);
    if (mine.some((s) => s.start_n < chapter.start_n || s.end_n > chapter.end_n)) {
      throw new Error(`a scene crosses chapter ${chapter.ch} bounds`);
    }
    return {
      ch: chapter.ch,
      title: chapter.title,
      scenes: mine.map((s) => ({
        id: s.id,
        title: s.title,
        emotion: s.final === null ? null : { ...s.final },
        paragraphs: sceneParagraphs.get(s.id) ?? [],
      })),
    };
  });
  return {
    bookId: book.id,
    textVersion: book.textVersion,
    title: book.title,
    author: book.author,
    chapters,
  };
}
