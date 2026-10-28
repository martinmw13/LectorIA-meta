// Word-mark treatment per skin. The six reader skins share the three
// decided treatments; anything unknown uses engraving.
export type HighlightTreatment = "engraving" | "watercolor" | "ink-doodle";

export function highlightStyleFor(skin: string): HighlightTreatment {
  if (skin === "watercolor" || skin === "chihiro") return "watercolor";
  if (skin === "ink" || skin === "comic") return "ink-doodle";
  return "engraving";
}

// Horizontal fit for the engraving overlay: the small-caps face runs
// wider than the in-flow word, so shrink it to the measured word rect.
// Never stretches, never divides by zero.
export function engravingScale(markWidth: number, naturalWidth: number): number {
  if (!Number.isFinite(markWidth) || !Number.isFinite(naturalWidth) || markWidth <= 0 || naturalWidth <= 0) {
    return 1;
  }
  return Math.min(1, markWidth / naturalWidth);
}
