// Word-mark treatment per skin. Only the three decided treatments
// exist; today's "default" skin and anything unknown use engraving.
export type HighlightTreatment = "engraving" | "watercolor" | "ink-doodle";

export function highlightStyleFor(skin: string): HighlightTreatment {
  if (skin === "watercolor") return "watercolor";
  if (skin === "ink-doodle") return "ink-doodle";
  return "engraving";
}
