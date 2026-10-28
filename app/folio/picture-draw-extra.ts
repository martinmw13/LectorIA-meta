// Drawings for the pencil, comic and chihiro skins: a graphite study,
// an inked panel and a watercolor dusk over the shared Oz scene.
// Layer 0 lays the base (outline, or washes for chihiro); higher layers add tone. Seeded per layer.
import { C, CONTOURS, R, blobPath, hatch, rng, segD, type DrawStroke, type Pt } from "./picture-draw-geom";

type ExtraSkin = "pencil" | "comic" | "chihiro";

const GRAPHITE = "#3E4147";
const PANEL_INK = "#14161C";
const SEPIA = "#5A3A2A";

const polyD = (p: Pt[]) => p.map(([x, y], i) => `${i ? "L" : "M"}${x} ${y}`).join("") + "Z";

function contours(stroke: string, width: number, opacity: number): DrawStroke[] {
  return CONTOURS.map((k) => ({ d: C[k], stroke, width: k === "funnel" ? width * 1.2 : width, opacity }));
}

function tone(poly: Pt[], deg: number, gap: number, seed: number, stroke: string, width: number, opacity: number): DrawStroke[] {
  return hatch(poly, deg, gap, 0.8, rng(seed)).map((s) => ({ d: segD(s, 2), stroke, width, opacity }));
}

function wash(spots: [number, number, string, number][], seed: number, opacity: number, jitter = 0): DrawStroke[] {
  const r = rng(seed);
  return spots.map(([x, y, c, rad]) => ({
    d: blobPath(x + (r() - 0.5) * jitter, y + (r() - 0.5) * jitter * 0.7, rad, r),
    stroke: "none",
    width: 0,
    opacity,
    fill: c,
    blurred: true,
  }));
}

function pencilLayer(layer: number): DrawStroke[] {
  if (layer === 0) return contours(GRAPHITE, 1.1, 0.85);
  if (layer === 1) {
    return [
      ...tone(R.roof, 45, 4.5, 21, "#555A61", 0.55, 0.55),
      ...tone(R.wall, 80, 6, 22, "#555A61", 0.5, 0.4),
      ...tone(R.ground, 12, 5, 23, "#555A61", 0.5, 0.45),
    ];
  }
  if (layer === 2) {
    return [
      ...tone(R.roof, -45, 5, 24, "#3E4147", 0.5, 0.45),
      ...tone(R.funnel, 70, 3.5, 25, "#3E4147", 0.6, 0.5),
      ...wash([[80, 90, "#8A8F96", 40], [250, 120, "#6B6F76", 34], [150, 330, "#8A8F96", 50]], 26, 0.14),
    ];
  }
  const polys = [R.sky, R.ground, R.wall];
  const poly = polys[layer % polys.length] ?? R.sky;
  return tone(poly, layer % 2 ? 30 : -30, 6 + (layer % 4), 30 + layer, "#6B6F76", 0.45, 0.28);
}

const COMIC_FILLS: [Pt[], string][] = [
  [R.sky, "#D6E6FF"], [R.ground, "#9BD08A"], [R.funnel, "#9CA3AF"], [R.wall, "#FFE45C"], [R.roof, "#E5484D"],
];

function comicFills(opacity: number): DrawStroke[] {
  return COMIC_FILLS.map(([p, fill]) => ({ d: polyD(p), stroke: "none", width: 0, opacity, fill }));
}

function speedLines(seed: number, opacity: number): DrawStroke[] {
  const r = rng(seed);
  return Array.from({ length: 9 }, (_, i) => {
    const a = (i / 9) * Math.PI * 1.2 + Math.PI * 0.4 + (r() - 0.5) * 0.2;
    const r1 = 40 + r() * 8;
    const r2 = r1 + 14 + r() * 10;
    const at = (rad: number) => `${(262 + Math.cos(a) * rad).toFixed(1)} ${(150 + Math.sin(a) * rad * 1.6).toFixed(1)}`;
    return { d: `M${at(r1)}L${at(r2)}`, stroke: PANEL_INK, width: 1.8, opacity };
  });
}

function comicLayer(layer: number): DrawStroke[] {
  if (layer === 0) return contours(PANEL_INK, 3, 1);
  if (layer === 1) return comicFills(0.92);
  if (layer === 2) return contours(PANEL_INK, 3.2, 1);
  if (layer === 3) return speedLines(41, 1);
  // Halftone rows across the sky, one row per pass.
  const y = 50 + ((layer - 4) % 9) * 11;
  const off = layer % 2 ? 5 : 0;
  let d = "";
  for (let x = 30 + off; x < 230; x += 10) d += `M${x} ${y}h.01`;
  return [{ d, stroke: "#58AEFF", width: 3, opacity: 0.55 }];
}

const DUSK: [number, number, string, number][] = [
  [70, 50, "#A9D3E6", 50], [200, 46, "#BFE0EA", 56], [120, 118, "#F6C79A", 52], [222, 128, "#F2B860", 44],
  [150, 192, "#D2452E", 30], [150, 248, "#F3E2C4", 44], [90, 318, "#5FA8A0", 48], [210, 322, "#4E9A93", 52],
  [150, 352, "#7FB89A", 40],
];

const LANTERN: DrawStroke[] = [
  { d: "M118 206v10", stroke: SEPIA, width: 1, opacity: 0.9 },
  { d: blobPath(118, 228, 20, rng(7)), stroke: "none", width: 0, opacity: 0.55, fill: "#FFC25A", blurred: true },
  { d: "M112 216h12c2.4 4 2.4 20 0 24h-12c-2.4-4-2.4-20 0-24z", stroke: SEPIA, width: 0.8, opacity: 1, fill: "#D2452E" },
];

function chihiroLayer(layer: number): DrawStroke[] {
  // Washes first, then the clean linework over them.
  if (layer === 0) return wash(DUSK, 51, 0.55);
  if (layer === 1) return contours(SEPIA, 0.9, 0.75);
  if (layer === 2) {
    return [...wash([[70, 92, "#F8D3B0", 30], [190, 70, "#FBE3C6", 36]], 52, 0.6), ...LANTERN];
  }
  return wash(DUSK, 50 + layer, 0.28, 20).map((s, i) => (i % 2 ? s : { ...s, opacity: 0.2 }));
}

export function extraLayer(skin: ExtraSkin, layer: number): DrawStroke[] {
  if (skin === "pencil") return pencilLayer(layer);
  if (skin === "comic") return comicLayer(layer);
  return chihiroLayer(layer);
}

export function extraStill(skin: ExtraSkin): DrawStroke[] {
  if (skin === "pencil") return [...contours(GRAPHITE, 1.1, 0.85), ...pencilLayer(1)];
  if (skin === "comic") return [...comicFills(0.92), ...contours(PANEL_INK, 3, 1)];
  return [...wash(DUSK, 51, 0.55), ...LANTERN, ...contours(SEPIA, 0.9, 0.75)];
}
