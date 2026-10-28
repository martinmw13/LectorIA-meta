// Drawing variant for the "Picture this" loading slot. The skin owner
// (app/skin.ts) holds the live skin; this maps it to a drawing variant.
"use client";

import { getSkin, type SkinId } from "../skin";
import { useSkin } from "../use-skin";

export type PictureSkin = "engraving" | "watercolor" | "ink";

// One entry per skin id (typed, so a new skin in app/skin.ts must pick one).
// Skins without their own drawing yet use the nearest style; giving a skin
// its own animation later means adding a variant and pointing it here.
const VARIANTS: Record<SkinId, PictureSkin> = {
  engraving: "engraving",
  watercolor: "watercolor",
  ink: "ink",
  pencil: "engraving", // line work, nearest to the etching needle
  comic: "ink", // inked outlines
  chihiro: "watercolor", // painted washes
};

export function pictureVariant(skin: string | null | undefined): PictureSkin {
  return (skin && Object.hasOwn(VARIANTS, skin) && VARIANTS[skin as SkinId]) || "engraving";
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
