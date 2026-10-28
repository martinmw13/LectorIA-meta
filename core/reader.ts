// Reader model: the slim shape the client receives. Joins paragraphs to
// scenes by ordinal range in reading order; analysis internals never leave.
import type { AnalyzedScene, Book } from "./types";
import type { Vector8 } from "./types";

export interface ReaderParagraph {
  id: string;
  n: number;
  text: string;
  // Set on fragments after the first when paginateScene splits one
  // paragraph across pages. Fragments share n; ids stay unique.
  cont?: boolean;
  // Char offset into the original paragraph where this fragment starts.
  // Whole paragraphs and first fragments carry 0; later fragments carry
  // the cut point, so read-along highlights can map word timings (which
  // are paragraph-relative) onto the visible fragment text.
  from?: number;
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
// each paragraph costs ceil((chars + indent) / 58) lines and short
// dialogue lines each take a full line. Page one also carries the drop cap, so it
// budgets one less. Paragraphs stay whole; one over budget takes its own
// page.
export const PAGE_WORD_BUDGET = 250;
const READ_COL_PX = 595;
const HEADING_PX = 115;
const LINE_PX = 20.5 * 1.7;
export const CHARS_PER_LINE = 58;
// First-line indent (1.5em ≈ 30 px ≈ 4 chars) eats measure on every
// indented paragraph: all but the scene opener and cont fragments.
export const INDENT_CHARS = 4;
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

export function estimateLines(text: string, indented = false): number {
  return Math.max(1, Math.ceil((text.length + (indented ? INDENT_CHARS : 0)) / CHARS_PER_LINE));
}

// Title measure: ~26 chars per line at the 44 px chapter-title size in
// the 538 px column. "The Cyclone" is 1 line,
// "The Discovery of Oz, the Terrible" is 2.
export const TITLE_CHARS_PER_LINE = 26;
const WRAPPED_TITLE_PENALTY = 2;

export function chapterTitleLines(title: string): number {
  if (title.length === 0) return 1;
  return Math.max(1, Math.ceil(title.length / TITLE_CHARS_PER_LINE));
}

// Latest sentence end (`. `, `! `, `? `, `; `, closing quotes included)
// at or before maxChars, as a cut index into text, or -1 when none fits.
// The cut sits just past the space, so fragments join back exactly.
function sentenceCut(text: string, maxChars: number): number {
  const re = /[.!?;]["'”’)\]]* /g;
  let cut = -1;
  for (;;) {
    const m = re.exec(text);
    if (m === null) break;
    const end = m.index + m[0].length;
    if (end > maxChars || end >= text.length) break;
    cut = end;
  }
  return cut;
}

// Latest cut at or before maxChars that fits maxWords: the sentence cut
// when one fits, else the last space, else a hard cut. Backs off to an
// earlier space while the prefix holds too many words.
function findCut(text: string, maxChars: number, maxWords: number): number {
  const cap = Math.min(maxChars, text.length - 1);
  let cut = sentenceCut(text, cap);
  if (cut <= 0) {
    const at = text.lastIndexOf(" ", cap);
    // at + 1 can pass maxChars by one char (a 2-line 59-char slip
    // into a 1-line slot), so clamp: the space opens the next fragment.
    cut = at <= 0 ? cap : Math.min(at + 1, cap);
  }
  while (cut > 1 && countWords(text.slice(0, cut)) > maxWords) {
    const at = text.lastIndexOf(" ", cut - 2);
    if (at <= 0) break;
    cut = at + 1;
  }
  return Math.max(1, Math.min(cut, text.length - 1));
}

// Split one scene into sub-pages: a page closes when the next paragraph
// would pass the word budget or the line budget. A paragraph that fits
// the remaining budget, or a fresh page when the current one has text,
// moves whole. One longer than a full page fills the current page at a
// sentence boundary (word boundary fallback) and continues on the next;
// fragments share n, later ones carry cont. A wrapped chapter title
// costs every page WRAPPED_TITLE_PENALTY lines.
export function paginateScene(
  paragraphs: ReaderParagraph[],
  budgetWords: number = PAGE_WORD_BUDGET,
  chapterTitle: string = "",
): SubPage[] {
  const penalty = chapterTitleLines(chapterTitle) > 1 ? WRAPPED_TITLE_PENALTY : 0;
  const budgetFor = (pageIndex: number): number =>
    (pageIndex === 0 ? FIRST_PAGE_LINES : LINES_PER_PAGE) - penalty;
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
  const pushFrag = (p: ReaderParagraph, text: string, fragNo: number, indented: boolean, from: number) => {
    const w = countWords(text);
    const l = estimateLines(text, indented);
    current.push(
      fragNo === 0
        ? { id: p.id, n: p.n, text, from }
        : { id: `${p.id}~${fragNo + 1}`, n: p.n, text, cont: true, from },
    );
    words += w;
    lines += l;
  };
  for (let pi = 0; pi < paragraphs.length; pi++) {
    const p = paragraphs[pi] as ReaderParagraph;
    let rest = p.text;
    let fragNo = 0;
    while (rest.length > 0) {
      // The scene opener carries the drop cap and cont fragments carry
      // no indent; every other first fragment pays INDENT_CHARS.
      const indented = pi > 0 && fragNo === 0;
      const budget = budgetFor(pages.length);
      const remainingLines = budget - lines;
      const remainingWords = budgetWords - words;
      const wRest = countWords(rest);
      const lRest = estimateLines(rest, indented);
      const from = p.text.length - rest.length;
      if (lRest <= remainingLines && wRest <= remainingWords) {
        pushFrag(p, rest, fragNo, indented, from);
        rest = "";
      } else if (remainingLines <= 0 || remainingWords <= 0) {
        flush();
      } else if (current.length > 0 && lRest <= budgetFor(pages.length + 1) && wRest <= budgetWords) {
        flush();
      } else {
        const cut = findCut(rest, remainingLines * CHARS_PER_LINE - (indented ? INDENT_CHARS : 0), remainingWords);
        pushFrag(p, rest.slice(0, cut), fragNo, indented, from);
        fragNo += 1;
        rest = rest.slice(cut);
        flush();
      }
    }
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
  isChapterFirst: boolean;
  isChapterLast: boolean;
}

// The chapter cover (page 0 of the first scene) and the chapter-end
// page (trailing page of the last scene) belong to their scene: they
// shift sub-page indexes only, so music entry still fires per route id.
export type SubPageKind = "cover" | "text" | "end";

export function subPageCount(textPages: number, cover: boolean, end: boolean): number {
  return textPages + (cover ? 1 : 0) + (end ? 1 : 0);
}

export function subPageKind(page: number, textPages: number, cover: boolean, end: boolean): SubPageKind {
  if (cover && page === 0) return "cover";
  if (end && page === subPageCount(textPages, cover, end) - 1) return "end";
  return "text";
}

// Sub-page index to text-page index (the cover shifts text by one).
export function textPageAt(page: number, cover: boolean): number {
  return page - (cover ? 1 : 0);
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
  const atInChapter = chapterScenes.findIndex((e) => e.scene.id === sceneId);
  const prev = at > 0 ? flat[at - 1] : null;
  const next = at < flat.length - 1 ? flat[at + 1] : null;
  return {
    sceneId,
    ch: entry.ch,
    chapterTitle: entry.chapterTitle,
    title: entry.scene.title,
    emotion: entry.scene.emotion,
    pages: paginateScene(entry.scene.paragraphs, budgetWords, entry.chapterTitle),
    prevSceneId: prev?.scene.id ?? null,
    nextSceneId: next?.scene.id ?? null,
    k: atInChapter + 1,
    n: chapterScenes.length,
    isChapterFirst: atInChapter === 0,
    isChapterLast: atInChapter === chapterScenes.length - 1,
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
