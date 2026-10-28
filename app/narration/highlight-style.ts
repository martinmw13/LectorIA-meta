// Word-mark treatment per skin. Ink and comic share the doodle circle;
// the other four draw their own marks behind the text. Unknown skins
// use engraving.
export type HighlightTreatment = "engraving" | "watercolor" | "pencil" | "lantern" | "ink-doodle";

export function highlightStyleFor(skin: string): HighlightTreatment {
  if (skin === "watercolor") return "watercolor";
  if (skin === "pencil") return "pencil";
  if (skin === "chihiro") return "lantern";
  if (skin === "ink" || skin === "comic") return "ink-doodle";
  return "engraving";
}
