// Chapter panels: the one grouping rule for captions and the chapter
// page prompt. Pure: no env reads, no network. The client sends only the
// chapter number; descriptions come from trusted server-side summaries.
import { clipText, styleLine } from "./images";
import type { ImageStyle, StyleBook } from "./image-style";
import { panelCaption } from "./reader";

export interface ChapterPanelGroup {
  sceneIds: string[];
  caption: string;
  description: string;
}

// Up to 6 panels. Past 6 scenes, adjacent scenes merge into 6
// contiguous groups, sizes as even as possible, larger groups first.
export function chapterPanels(scenes: { id: string; summary: string }[]): ChapterPanelGroup[] {
  if (scenes.length === 0) return [];
  const groups = Math.min(scenes.length, 6);
  const base = Math.floor(scenes.length / groups);
  const extra = scenes.length % groups;
  const out: ChapterPanelGroup[] = [];
  let at = 0;
  for (let g = 0; g < groups; g++) {
    const slice = scenes.slice(at, at + base + (g < extra ? 1 : 0));
    at += slice.length;
    const first = slice[0];
    if (!first) continue;
    out.push({
      sceneIds: slice.map((s) => s.id),
      caption: panelCaption(first.summary),
      description: slice.map((s) => s.summary).join(" "),
    });
  }
  return out;
}

// Fixed grid: panels per row, top to bottom.
const PANEL_ROWS: Record<number, number[]> = {
  1: [1],
  2: [1, 1],
  3: [1, 2],
  4: [2, 2],
  5: [2, 1, 2],
  6: [2, 2, 2],
};

export function panelRows(count: number): number[] {
  const rows = PANEL_ROWS[count];
  if (!rows) throw new RangeError(`panel count ${count} has no layout`);
  return [...rows];
}

export const PANEL_DESC_CHARS = 300;

export function buildChapterPrompt(args: {
  chapterTitle: string;
  panels: { description: string }[];
  style?: ImageStyle;
  book?: StyleBook;
}): string {
  const rows = panelRows(args.panels.length);
  const panelsWord = args.panels.length === 1 ? "panel" : "panels";
  const rowsWord = rows.length === 1 ? "row" : "rows";
  const layout = rows.map((count, i) => `row ${i + 1} has ${count}`).join(", ");
  return (
    `Chapter "${args.chapterTitle}". A square comic page with ${args.panels.length} ${panelsWord} ` +
    `in ${rows.length} ${rowsWord} (${layout}), read left to right, top to bottom. ` +
    args.panels
      .map((p, i) => `Panel ${i + 1}: ${clipText(p.description, PANEL_DESC_CHARS)}.`)
      .join(" ") +
    ` ${styleLine(args.style, args.book)} No text, letters, numbers, captions, sound effects or speech ` +
    `balloons anywhere in the image.`
  );
}
