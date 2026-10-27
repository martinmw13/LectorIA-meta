// Gutenberg ingest: strip the license wrapper, drop front matter, split
// chapters into paragraphs with global ordinals.
import { paragraphId } from "./ids";
import type { Book, Chapter, Paragraph } from "./types";

const START_MARKER = "*** START OF THE PROJECT GUTENBERG EBOOK";
const END_MARKER = "*** END OF THE PROJECT GUTENBERG EBOOK";

// Matches a real chapter heading line ("Chapter I") after trimming, so the
// indented Contents lines (" Chapter I. The Cyclone") never match.
export const CHAPTER_HEADING = /^Chapter ([IVXLC]+)$/;

export function stripGutenberg(raw: string): string {
  const start = raw.indexOf(START_MARKER);
  const end = raw.indexOf(END_MARKER);
  if (start === -1 || end === -1 || end <= start) {
    throw new Error("Gutenberg START/END markers missing or out of order");
  }
  const startLine = raw.indexOf("\n", start);
  const endLine = raw.lastIndexOf("\n", end);
  return raw.slice(startLine + 1, endLine);
}

export function splitParagraphs(text: string): string[] {
  return text
    .replace(/\r\n?/g, "\n")
    .split(/\n[ \t]*\n/)
    .map((block) => block.replace(/[ \t]*\n[ \t]*/g, " ").replace(/\s+/g, " ").trim())
    .filter((block) => block.length > 0);
}

interface ChapterDraft {
  title: string;
  paragraphs: string[];
}

// Splits stripped body text into chapters. Works line by line because
// the heading and its title sit on adjacent lines with no blank line
// between them. Drops everything before the first chapter heading
// (title page, Contents, Introduction) and any [Illustration...] line.
export function splitChapters(body: string): ChapterDraft[] {
  const chapters: ChapterDraft[] = [];
  let current: ChapterDraft | null = null;
  let titlePending = false;
  let buffer: string[] = [];
  const flush = (): string => {
    const para = buffer.join(" ").replace(/\s+/g, " ").trim();
    buffer = [];
    return para;
  };
  const pushPara = (para: string): void => {
    if (para.length === 0 || /^\[Illustration/.test(para)) return;
    if (current === null) return; // front matter before chapter one
    if (titlePending) {
      current.title = para;
      titlePending = false;
      return;
    }
    current.paragraphs.push(para);
  };
  for (const line of body.replace(/\r\n?/g, "\n").split("\n")) {
    const trimmed = line.trim();
    if (trimmed.length === 0) {
      pushPara(flush());
      continue;
    }
    if (CHAPTER_HEADING.exec(trimmed)) {
      pushPara(flush());
      current = { title: "", paragraphs: [] };
      chapters.push(current);
      titlePending = true;
      continue;
    }
    buffer.push(trimmed);
  }
  pushPara(flush());
  return chapters.filter((chapter) => chapter.paragraphs.length > 0);
}

export function buildBook(input: {
  id: string;
  title: string;
  author: string;
  gutenberg: number;
  chapters: { title: string; paragraphs: string[] }[];
}): Omit<Book, "textVersion"> {
  const chapters: Chapter[] = [];
  const paragraphs: Paragraph[] = [];
  let n = 0;
  input.chapters.forEach((draft, index) => {
    const ch = index + 1;
    const start_n = n + 1;
    draft.paragraphs.forEach((text, k) => {
      n += 1;
      paragraphs.push({ id: paragraphId(ch, k + 1), ch, n, text });
    });
    chapters.push({ ch, title: draft.title, start_n, end_n: n });
  });
  return {
    id: input.id,
    title: input.title,
    author: input.author,
    source: {
      gutenberg: input.gutenberg,
      url: `https://www.gutenberg.org/ebooks/${input.gutenberg}`,
    },
    chapters,
    paragraphs,
  };
}

// Canonical hash input: one `id\ttext` line per paragraph.
export function canonicalLines(paragraphs: Pick<Paragraph, "id" | "text">[]): string {
  return paragraphs.map((p) => `${p.id}\t${p.text}`).join("\n");
}
