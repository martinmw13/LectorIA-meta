// Drawing variant for the "Picture this" loading slot. The skin owner
// (app/skin.ts) holds the live skin; this maps it to a drawing variant.
"use client";

import { getSkin } from "../skin";
import { useSkin } from "../use-skin";

export type PictureSkin = "engraving" | "watercolor" | "ink";

// One entry per skin id. A skin's own animation later means changing its
// value here from the shared variant to a new one.
const VARIANTS: Record<string, PictureSkin> = {
  engraving: "engraving",
  watercolor: "watercolor",
  ink: "ink",
  comic: "ink",
  "anime-ghibli": "watercolor",
  chihiro: "watercolor",
  pencil: "engraving",
  graphite: "engraving",
  "graphite-pencil": "engraving",
};

export function pictureVariant(skin: string | null | undefined): PictureSkin {
  return (skin && VARIANTS[skin]) || "engraving";
}

export function pictureSkin(): PictureSkin {
  return pictureVariant(getSkin());
}

export function usePictureSkin(): PictureSkin {
  return pictureVariant(useSkin());
}

// Raw skin id for the data-picture-skin slot hook; per-skin CSS keys off
// it while the drawing uses the shared variant above.
export function usePictureSkinId(): string {
  return useSkin();
}
