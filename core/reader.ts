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

// Shared with the resplit pipeline, which budgets scenes by words.
export function countWords(text: string): number {
  const words = text.split(/\s+/).filter((w) => w.length > 0);
  return words.length;
}

// One short caption per panel: the first clause of the scene summary,
// cut at a word boundary to 90 chars with an ellipsis when longer.
export const PANEL_CAPTION_MAX = 90;

export function panelCaption(summary: string): string {
  const clean = summary.replace(/\s+/g, " ").trim();
  if (clean.length <= PANEL_CAPTION_MAX) return clean;
  const end = clean.search(/[.!?;]["'”’)\]]?\s/);
  const first = end > 0 && end < PANEL_CAPTION_MAX ? clean.slice(0, end + 1) : null;
  if (first) return first;
  const cut = clean.slice(0, PANEL_CAPTION_MAX - 1);
  return `${cut.slice(0, Math.max(1, cut.lastIndexOf(" "))).trimEnd()}…`;
}

// True only when the scene id changed. The container gates observeScene
// on this, so staying inside one scene never touches the scheduler.
export function isSceneEntry(prevSceneId: string | null, nextSceneId: string): boolean {
  return prevSceneId !== nextSceneId;
}

export interface SceneEntryGate {
  observedId: string | null;
  routeId: string | null;
  manifestReady: boolean;
}

// The container's effect gate in one testable place: observe exactly once
// per scene id, only after the manifest lands. Params can lag a render,
// so the last observed id is compared before every observe call.
export function nextSceneEntry(gate: SceneEntryGate): {
  shouldObserve: boolean;
  nextObservedId: string | null;
} {
  if (!gate.routeId || !gate.manifestReady || !isSceneEntry(gate.observedId, gate.routeId)) {
    return { shouldObserve: false, nextObservedId: gate.observedId };
  }
  return { shouldObserve: true, nextObservedId: gate.routeId };
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
