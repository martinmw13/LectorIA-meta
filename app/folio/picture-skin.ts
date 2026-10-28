// Which drawing skin to use for the "Picture this" loading slot.
// A skin seam (data-skin on <html>, ?skin= param) lives on another
// branch; until it lands this reads the same sources directly and
// falls back to engraving. SSR-safe: no document means engraving.
"use client";

import { useEffect, useState } from "react";

export type PictureSkin = "engraving" | "watercolor" | "ink";

const SKINS: readonly string[] = ["engraving", "watercolor", "ink"];

function fromValue(value: string | null | undefined): PictureSkin {
  return value && (SKINS as readonly string[]).includes(value) ? (value as PictureSkin) : "engraving";
}

export function pictureSkin(): PictureSkin {
  if (typeof document === "undefined") return "engraving";
  const attr = document.documentElement?.dataset?.skin;
  if (attr) return fromValue(attr);
  try {
    const param = new URLSearchParams(window.location.search).get("skin");
    return fromValue(param);
  } catch {
    return "engraving";
  }
}

// First paint is always engraving so SSR HTML matches; the real skin
// applies in an effect once mounted.
export function usePictureSkin(): PictureSkin {
  const [skin, setSkin] = useState<PictureSkin>("engraving");
  useEffect(() => {
    setSkin(pictureSkin());
  }, []);
  return skin;
}
