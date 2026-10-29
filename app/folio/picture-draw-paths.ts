// Stand-in sketch paths for the drawing slot: the prototype's Oz
// house/cyclone scene. Pure data, no DOM. Seeded per layer so every
// replay draws the same picture.
import type { PictureSkin } from "./picture-skin";

import {
  C,
  CONTOURS,
  OVAL,
  OVAL_INNER,
  R,
  blobPath,
  clip,
  hatch,
  ovalPts,
  rng,
  segD,
  zigzag,
  type DrawStroke,
  type Pt,
} from "./picture-draw-geom";
import { extraLayer, extraStill } from "./picture-draw-extra";

export type { DrawStroke } from "./picture-draw-geom";

const INK = "#2A241C";
const BLUE = "#0866FF";

function engravingLayer(layer: number): DrawStroke[] {
  const r = rng(3 + layer);
  if (layer === 0) {
    const out: DrawStroke[] = [
      { d: OVAL, stroke: INK, width: 1.1, opacity: 1 },
      { d: OVAL_INNER, stroke: INK, width: 0.5, opacity: 1 },
    ];
    for (const k of CONTOURS) {
      out.push({ d: C[k], stroke: INK, width: k === "funnel" ? 1.2 : 0.9, opacity: 1 });
    }
    return out;
  }
  const oval = ovalPts();
  const polys: [Pt[], number, number][] = [
    [R.sky, layer % 2 ? -40 : 40, 6 + layer],
    [R.ground, layer % 2 ? 20 : -20, 5 + layer],
    [R.roof, layer % 2 ? 60 : -60, 4 + layer],
  ];
  const out: DrawStroke[] = [];
  for (const [poly, deg, gap] of polys) {
    for (const s of hatch(poly, deg, gap, 1, r)) {
      const a = s[0];
      const b = s[1];
      if (!a || !b) continue;
      const len = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
      const inside = clip(oval, a, [(b[0] - a[0]) / len, (b[1] - a[1]) / len]);
      if (inside) out.push({ d: segD(inside, 3), stroke: INK, width: 0.45, opacity: 0.7 });
    }
  }
  return out;
}

const SPOTS: [number, number, string, number][] = [
  [70, 70, "#9FC4FF", 46], [160, 56, "#C9DDF7", 52], [232, 96, "#7FB0FF", 40],
  [262, 180, "#9AA3B5", 30], [256, 250, "#9AA3B5", 24], [150, 190, "#C9785A", 36],
  [150, 246, "#E6C27A", 44], [110, 250, "#E6C27A", 30], [60, 262, "#6FA0E8", 18],
  [90, 318, "#B9C98A", 48], [200, 322, "#B9C98A", 52], [150, 350, "#CFD9A8", 40],
];

function watercolorLayer(layer: number): DrawStroke[] {
  const r = rng(11 + layer);
  const spots = layer ? [...SPOTS].sort(() => r() - 0.5) : SPOTS;
  return spots.map(([x, y, c, rad]) => {
    const jx = x + (r() - 0.5) * 24 * layer;
    const jy = y + (r() - 0.5) * 18 * layer;
    return {
      d: blobPath(jx, jy, rad * (layer ? 0.7 : 1), r),
      stroke: "none",
      width: 0,
      opacity: layer ? 0.35 : 0.6,
      fill: c,
      blurred: true,
    };
  });
}

const INK_REGIONS: [Pt[], number, number][] = [
  [R.roof, -35, 6], [R.ground, 8, 9], [R.wall, 70, 10], [R.sky, -12, 16],
];

function inkLayer(layer: number): DrawStroke[] {
  if (layer === 0) {
    return CONTOURS.map((k) => ({
      d: C[k],
      stroke: BLUE,
      width: k === "funnel" ? 2.2 : 1.8,
      opacity: 1,
    }));
  }
  const r = rng(9 + layer);
  const fallback: [Pt[], number, number] = [R.ground, 8, 9];
  const [poly, deg, gap] = INK_REGIONS[(layer - 1) % INK_REGIONS.length] ?? fallback;
  return [{
    d: zigzag(hatch(poly, deg, gap, 2, r)),
    stroke: BLUE,
    width: 1.1,
    opacity: 0.55,
  }];
}

// Layer 0 is the outline pass; higher layers cycle shading/wash depth.
export function strokesForSkin(skin: PictureSkin, layer: number): DrawStroke[] {
  if (skin === "pencil" || skin === "comic" || skin === "chihiro") return extraLayer(skin, layer);
  if (skin === "watercolor") return watercolorLayer(layer);
  if (skin === "ink") return inkLayer(layer);
  return engravingLayer(layer);
}

const STILL_SPOTS: [number, number, string, number][] = [
  [70, 70, "#9FC4FF", 46], [160, 56, "#C9DDF7", 52],
  [150, 246, "#E6C27A", 44], [150, 190, "#C9785A", 36],
  [200, 322, "#B9C98A", 52],
];

export function stillStrokes(skin: PictureSkin): DrawStroke[] {
  if (skin === "pencil" || skin === "comic" || skin === "chihiro") return extraStill(skin);
  if (skin === "watercolor") {
    const r = rng(2);
    return STILL_SPOTS.map(([x, y, c, rad]) => ({
      d: blobPath(x, y, rad, r),
      stroke: "none",
      width: 0,
      opacity: 0.6,
      fill: c,
      blurred: true,
    }));
  }
  const out: DrawStroke[] = [];
  if (skin === "engraving") {
    out.push({ d: OVAL, stroke: INK, width: 1.1, opacity: 1 });
  }
  const color = skin === "engraving" ? INK : BLUE;
  for (const k of CONTOURS) out.push({ d: C[k], stroke: color, width: 1.4, opacity: 0.9 });
  return out;
}

export const DRAW_STATUS: Record<PictureSkin, string> = {
  engraving: "Etching the plate",
  watercolor: "Letting the colours bloom",
  ink: "Doodling your scene",
  pencil: "Sketching this moment",
  comic: "Inking a new panel!",
  chihiro: "Painting this moment",
};

export const DRAW_NOTE = "Ready in about twenty seconds";
export const PANELS_NOTE = "Ready in about half a minute";
