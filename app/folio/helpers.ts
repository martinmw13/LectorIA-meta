// Quote captions read best near 80 chars; the split pane never drops
// below 220 px or past 46vw.
export const CAPTION_MAX = 80;
export const SPLIT_MIN_PX = 220;
export const SPLIT_MAX_VW = 0.46;

export function truncateCaption(text: string): string {
  const clean = text.replace(/\s+/g, " ").trim();
  if (clean.length <= CAPTION_MAX) return clean;
  return `${clean.slice(0, CAPTION_MAX - 1).trimEnd()}…`;
}

export function clampSplitWidth(px: number, viewportWidth: number): number {
  return Math.max(SPLIT_MIN_PX, Math.min(Math.round(viewportWidth * SPLIT_MAX_VW), Math.round(px)));
}
