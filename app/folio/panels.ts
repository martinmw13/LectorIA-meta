// Chapter panels data: bundled art and captions.
// The client receives the current chapter's short captions only, never
// other chapters' or full summaries (see docs/contracts/chapter-panels.md).
export const PANELS_LABEL = "Picture the chapter in panels";

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
