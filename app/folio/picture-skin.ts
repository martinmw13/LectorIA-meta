// Drawing skin for the "Picture this" slot. The skin owner (app/skin.ts)
// holds the live skin; every skin has its own drawing, so this only
// guards against unknown ids.
"use client";

import { DEFAULT_SKIN, getSkin, isSkinId, type SkinId } from "../skin";
import { useSkin } from "../use-skin";

export type PictureSkin = SkinId;

export function pictureVariant(skin: string | null | undefined): PictureSkin {
  return isSkinId(skin) ? skin : DEFAULT_SKIN;
}

export function pictureSkin(): PictureSkin {
  return pictureVariant(getSkin());
}

export function usePictureSkin(): PictureSkin {
  return pictureVariant(useSkin());
}
