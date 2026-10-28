// Chapter panels data: bundled art plus the per-session spoiler state.
// The client receives the current chapter's short captions only, never
// other chapters' or full summaries (see docs/contracts-chapters.md).
export const PANELS_NAME = "Chapter in panels";

export const PANEL_ART: Record<string, string> = {
  c1s2: "/art/panels/cyclone-doorway.jpg",
  c1s3: "/art/panels/cyclone-house.jpg",
};

export interface ChapterPanel {
  sceneId: string;
  caption: string;
  art: string | null;
}

// Cover title step: long titles shrink so the cover fits with no scroll.
// Short titles return undefined and keep the full-size look.
export function coverTitleLong(title: string): "1" | "2" | undefined {
  if (title.length > 36) return "2";
  if (title.length > 24) return "1";
  return undefined;
}

// Session memory: which chapters the reader has finished, opened
// anyway, or set aside. Plain sets, so a reload starts unspoiled.
const reachedEnd = new Set<number>();
const shownAnyway = new Set<number>();
const setAside = new Set<number>();

export function chapterEndReached(ch: number): boolean {
  return reachedEnd.has(ch);
}

export function markChapterEndReached(ch: number): void {
  reachedEnd.add(ch);
}

export function panelsUnlocked(ch: number): boolean {
  return reachedEnd.has(ch) || shownAnyway.has(ch);
}

export function markPanelsShownAnyway(ch: number): void {
  shownAnyway.add(ch);
}

export function chapterSetAside(ch: number): boolean {
  return setAside.has(ch);
}

export function markChapterSetAside(ch: number): void {
  setAside.add(ch);
}
