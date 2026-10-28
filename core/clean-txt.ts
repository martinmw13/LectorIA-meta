// Gutenberg txt fallback: same paragraphs as splitChapters today, wrapped
// with a report. No LLM. Oz keeps this path and its textVersion.
import { splitChapters, stripGutenberg } from "./gutenberg";
import type { CleanChapter, CleanReport, RemovedItem } from "./clean";

const GUT_START = "*** START OF THE PROJECT GUTENBERG EBOOK";
const GUT_END = "*** END OF THE PROJECT GUTENBERG EBOOK";
const CHAPTER_LINE = /^Chapter ([IVXLC]+)$/;

function countWords(text: string): number {
  return text.split(/\s+/).filter((w) => w.length > 0).length;
}

export function cleanGutenbergText(raw: string): { chapters: CleanChapter[]; report: CleanReport } {
  const body = stripGutenberg(raw);
  const headerEnd = raw.indexOf(GUT_START);
  const footerStart = raw.indexOf(GUT_END);
  const header = headerEnd === -1 ? "" : raw.slice(0, headerEnd);
  const footerLine = footerStart === -1 ? raw.length : raw.lastIndexOf("\n", footerStart);
  const footer = footerStart === -1 ? "" : raw.slice(footerLine + 1);
  const lines = body.split("\n");
  const firstChapter = lines.findIndex((line) => CHAPTER_LINE.test(line.trim()));
  const front = firstChapter === -1 ? body : lines.slice(0, firstChapter).join("\n");
  const drafts = splitChapters(body);
  const chapters: CleanChapter[] = drafts.map((d) => ({ title: d.title, paragraphs: d.paragraphs, sectionIds: [] }));
  const item = (sectionId: string, text: string, rule: string, kind: string, reason: string): RemovedItem => ({
    sectionId,
    blockRange: null,
    kind,
    reason,
    rule,
    words: countWords(text),
    preview: text.replace(/\s+/g, " ").trim().slice(0, 120),
  });
  return {
    chapters,
    report: {
      source: "gutenberg-txt",
      llm: null,
      kept: chapters.map((c) => ({ title: c.title, paragraphs: c.paragraphs.length, sectionIds: c.sectionIds })),
      removed: [
        item("gutenberg-header", header, "pg-markers", "boilerplate", "license header before START marker"),
        item("front-matter", front, "before-first-chapter", "front_matter", "front matter before the first chapter heading"),
        item("gutenberg-footer", footer, "pg-markers", "license", "license footer after END marker"),
      ],
      flagged: [],
      merged: [],
    },
  };
}
