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

// 1280x800 fit: the reading column is 595 px tall and the heading block
// (kicker, title, Scene/Page line) takes ~115 px of it on every page,
// leaving ~480 px for text. At 20.5px/1.7 each line costs 34.85 px, so a
// page holds 13 lines; the ~538 px measure fits ~58 chars per line, so
// each paragraph costs ceil(chars / 58) lines and short dialogue lines
// each take a full line. Page one also carries the drop cap, so it
// budgets one less. Paragraphs stay whole; one over budget takes its own
// page.
export const PAGE_WORD_BUDGET = 250;
const READ_COL_PX = 595;
const HEADING_PX = 115;
const LINE_PX = 20.5 * 1.7;
export const CHARS_PER_LINE = 58;
export const LINES_PER_PAGE = Math.floor((READ_COL_PX - HEADING_PX) / LINE_PX);
export const FIRST_PAGE_LINES = LINES_PER_PAGE - 1;

export interface SubPage {
  paragraphs: ReaderParagraph[];
  startN: number;
  endN: number;
  words: number;
}

export function countWords(text: string): number {
  const words = text.split(/\s+/).filter((w) => w.length > 0);
  return words.length;
}

export function estimateLines(text: string): number {
  return Math.max(1, Math.ceil(text.length / CHARS_PER_LINE));
}

// Split one scene into sub-pages at paragraph boundaries: a page closes
// when the next paragraph would pass the word budget or the line budget.
export function paginateScene(
  paragraphs: ReaderParagraph[],
  budgetWords: number = PAGE_WORD_BUDGET,
): SubPage[] {
  const pages: SubPage[] = [];
  let current: ReaderParagraph[] = [];
  let words = 0;
  let lines = 0;
  const flush = () => {
    if (current.length === 0) return;
    pages.push({
      paragraphs: current,
      startN: current[0]?.n ?? 0,
      endN: current[current.length - 1]?.n ?? 0,
      words,
    });
    current = [];
    words = 0;
    lines = 0;
  };
  for (const p of paragraphs) {
    const w = countWords(p.text);
    const l = estimateLines(p.text);
    const budget = pages.length === 0 ? FIRST_PAGE_LINES : LINES_PER_PAGE;
    if (current.length > 0 && (words + w > budgetWords || lines + l > budget)) flush();
    current.push(p);
    words += w;
    lines += l;
  }
  flush();
  if (pages.length === 0) pages.push({ paragraphs: [], startN: 0, endN: 0, words: 0 });
  return pages;
}

export interface SceneView {
  sceneId: string;
  ch: number;
  chapterTitle: string;
  title: string;
  emotion: ReaderScene["emotion"];
  pages: SubPage[];
  prevSceneId: string | null;
  nextSceneId: string | null;
  k: number;
  n: number;
}

// The only text a scene route ships: this scene, its chapter, its pages,
// and neighbor ids for the pager. Throws on unknown scene id.
export function buildSceneView(
  model: ReaderModel,
  sceneId: string,
  budgetWords: number = PAGE_WORD_BUDGET,
): SceneView {
  const flat = model.chapters.flatMap((c) => c.scenes.map((s) => ({ ch: c.ch, chapterTitle: c.title, scene: s })));
  const at = flat.findIndex((e) => e.scene.id === sceneId);
  if (at < 0 || !flat[at]) throw new Error(`unknown scene ${sceneId}`);
  const entry = flat[at] as { ch: number; chapterTitle: string; scene: ReaderScene };
  const chapterScenes = flat.filter((e) => e.ch === entry.ch);
  const prev = at > 0 ? flat[at - 1] : null;
  const next = at < flat.length - 1 ? flat[at + 1] : null;
  return {
    sceneId,
    ch: entry.ch,
    chapterTitle: entry.chapterTitle,
    title: entry.scene.title,
    emotion: entry.scene.emotion,
    pages: paginateScene(entry.scene.paragraphs, budgetWords),
    prevSceneId: prev?.scene.id ?? null,
    nextSceneId: next?.scene.id ?? null,
    k: chapterScenes.findIndex((e) => e.scene.id === sceneId) + 1,
    n: chapterScenes.length,
  };
}

export interface NavState {
  sceneId: string;
  page: number;
}

export type NavAction =
  | { kind: "next" }
  | { kind: "prev" }
  | { kind: "goto"; sceneId: string; atEnd?: boolean };

export interface NavIndex {
  order: string[];
  pageCounts: Map<string, number>;
}

export function buildNavIndex(views: { sceneId: string; pages: number }[]): NavIndex {
  return {
    order: views.map((v) => v.sceneId),
    pageCounts: new Map(views.map((v) => [v.sceneId, v.pages] as [string, number])),
  };
}

// Every pager move in one place: next/prev cross scenes and chapters,
// going back lands on the last sub-page, bounds are no-ops, unknown
// goto ids keep state.
export function navReducer(state: NavState, action: NavAction, index: NavIndex): NavState {
  const at = index.order.indexOf(state.sceneId);
  if (at < 0) return state;
  const pages = index.pageCounts.get(state.sceneId) ?? 1;
  if (action.kind === "next") {
    if (state.page < pages - 1) return { ...state, page: state.page + 1 };
    const nextId = index.order[at + 1];
    return nextId === undefined ? state : { sceneId: nextId, page: 0 };
  }
  if (action.kind === "prev") {
    if (state.page > 0) return { ...state, page: state.page - 1 };
    const prevId = at > 0 ? index.order[at - 1] : undefined;
    if (prevId === undefined) return state;
    return { sceneId: prevId, page: (index.pageCounts.get(prevId) ?? 1) - 1 };
  }
  if (index.order.indexOf(action.sceneId) < 0) return state;
  const count = index.pageCounts.get(action.sceneId) ?? 1;
  return { sceneId: action.sceneId, page: action.atEnd ? count - 1 : 0 };
}

// True only when the scene id changed. The container gates observeScene
// on this, so sub-page moves never touch the scheduler.
export function isSceneEntry(prevSceneId: string | null, nextSceneId: string): boolean {
  return prevSceneId !== nextSceneId;
}

export interface SceneEntryGate {
  observedId: string | null;
  routeId: string | null;
  manifestReady: boolean;
}

// The container's effect gate in one testable place: observe exactly once
// per route id, only after the manifest lands. Route params can lag a
// render, so the last observed id is compared before every observe call.
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
