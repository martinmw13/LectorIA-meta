// The one file that owns cover paths. Placeholders exist only for the
// three painted skins, so each newer skin reuses one (typed, so a new
// skin must choose). Oz always uses the cyclone-house panel. Swapping in
// final covers later means editing this file only.
import type { SkinId } from "../skin";

export type CoverSize = "sm" | "lg";

type CoverSkin = "engraving" | "watercolor" | "ink";

const COVER_SKIN: Record<SkinId, CoverSkin> = {
  engraving: "engraving",
  watercolor: "watercolor",
  ink: "ink",
  pencil: "engraving",
  comic: "ink",
  chihiro: "watercolor",
};

const OZ_COVER = "/art/panels/cyclone-house.webp";

export function coverFor(bookId: string, skin: SkinId, size: CoverSize): string {
  if (bookId === "oz") return OZ_COVER;
  return `/art/covers/${bookId}-${COVER_SKIN[skin]}${size === "sm" ? "-sm" : ""}.jpg`;
}
