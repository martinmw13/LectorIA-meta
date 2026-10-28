// Stand-in sketch paths for the drawing slot: the prototype's Oz
// house/cyclone scene. Pure data, no DOM. Seeded per layer so every
// replay draws the same picture.
import type { PictureSkin } from "./picture-skin";

export interface DrawStroke {
  d: string;
  stroke: string;
  width: number;
  opacity: number;
  fill?: string;
  blurred?: boolean;
}

type Rng = () => number;

function rng(seed: number): Rng {
  return () => {
    seed = (seed * 16807) % 2147483647;
    return (seed - 1) / 2147483646;
  };
}

type Pt = [number, number];

const R: Record<"sky" | "roof" | "wall" | "ground" | "funnel", Pt[]> = {
  sky: [[24, 26], [276, 26], [276, 160], [24, 160]],
  roof: [[86, 212], [150, 160], [214, 212]],
  wall: [[96, 212], [204, 212], [204, 280], [96, 280]],
  ground: [[24, 284], [276, 284], [276, 354], [24, 354]],
  funnel: [[236, 64], [290, 64], [262, 288], [250, 288]],
};

const C: Record<
  | "ground" | "wall" | "roof" | "door" | "window" | "chimney"
  | "funnel" | "cloud" | "wind1" | "wind2" | "dorothy" | "toto",
  string
> = {
  ground: "M22 288C70 282 120 294 170 287S250 292 280 287",
  wall: "M96 212L96 280L204 280L204 212",
  roof: "M84 214L150 160L216 214Z",
  door: "M137 280L137 244L160 244L160 280",
  window: "M174 226h20v18h-20zM184 226v18",
  chimney: "M180 182v-24h13v34",
  funnel:
    "M286 66C236 66 226 84 266 90C300 96 284 112 256 114C228 118 262 136 266 148C272 166 246 176 256 196C264 212 248 226 254 250C258 268 250 280 256 292",
  cloud: "M36 92c-2-16 20-24 30-10c6-16 34-14 34 4c16 0 18 20 2 22H42c-14 0-16-16-6-16z",
  wind1: "M34 140q28-12 56 0t56 0",
  wind2: "M62 120q24-9 48 0",
  dorothy: "M60 236a7 7 0 1 0 .1 0M60 250L48 282H72ZM50 260L40 252M70 260L80 250M55 282v8M65 282v8",
  toto: "M86 284c-2-8 4-12 10-10c4-6 10-2 8 3c2 4-2 8-6 7c-4 3-10 3-12 0zM90 285v4M100 285v4",
};

const CONTOURS: (keyof typeof C)[] = [
  "ground", "wall", "roof", "door", "window", "chimney",
  "dorothy", "toto", "funnel", "cloud", "wind1", "wind2",
];

const OVAL = "M150 26C230 26 282 100 282 190S230 354 150 354S18 280 18 190S70 26 150 26Z";
const OVAL_INNER = "M150 34C224 34 274 104 274 190S224 346 150 346S26 276 26 190S76 34 150 34Z";

function ovalPts(): Pt[] {
  return Array.from({ length: 28 }, (_, i) => [
    150 + 128 * Math.cos((i / 28) * 2 * Math.PI),
    190 + 160 * Math.sin((i / 28) * 2 * Math.PI),
  ]) as Pt[];
}

function clip(poly: Pt[], p0: Pt, d: Pt): Pt[] | null {
  const c: Pt = poly.reduce<Pt>((a, p) => [a[0] + p[0] / poly.length, a[1] + p[1] / poly.length], [0, 0]);
  let t0 = -1e4;
  let t1 = 1e4;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i];
    const b = poly[(i + 1) % poly.length];
    if (!a || !b) return null;
    let n: Pt = [-(b[1] - a[1]), b[0] - a[0]];
    if (n[0] * (c[0] - a[0]) + n[1] * (c[1] - a[1]) < 0) n = [-n[0], -n[1]];
    const den = n[0] * d[0] + n[1] * d[1];
    const num = n[0] * (p0[0] - a[0]) + n[1] * (p0[1] - a[1]);
    if (Math.abs(den) < 1e-9) {
      if (num < 0) return null;
    } else {
      const t = -num / den;
      if (den > 0) t0 = Math.max(t0, t);
      else t1 = Math.min(t1, t);
    }
  }
  return t0 < t1
    ? [[p0[0] + d[0] * t0, p0[1] + d[1] * t0], [p0[0] + d[0] * t1, p0[1] + d[1] * t1]]
    : null;
}

function hatch(poly: Pt[], deg: number, gap: number, jit: number, r: Rng): Pt[][] {
  const a = (deg * Math.PI) / 180;
  const d: Pt = [Math.cos(a), Math.sin(a)];
  const n: Pt = [-d[1], d[0]];
  const pr = poly.map((p) => p[0] * n[0] + p[1] * n[1]);
  const lo = Math.min(...pr);
  const hi = Math.max(...pr);
  const out: Pt[][] = [];
  for (let s = lo + gap / 2; s < hi; s += gap) {
    const seg = clip(poly, [n[0] * (s + (r() - 0.5) * jit), n[1] * (s + (r() - 0.5) * jit)], d);
    const s0 = seg?.[0];
    const s1 = seg?.[1];
    if (s0 && s1 && Math.hypot(s1[0] - s0[0], s1[1] - s0[1]) > 4) out.push(seg);
  }
  return out;
}

function segD(seg: Pt[], inset = 2): string {
  const a = seg[0];
  const b = seg[1];
  if (!a || !b) return "";
  const L = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
  const ux = (b[0] - a[0]) / L;
  const uy = (b[1] - a[1]) / L;
  return `M${(a[0] + ux * inset).toFixed(1)} ${(a[1] + uy * inset).toFixed(1)}L${(b[0] - ux * inset).toFixed(1)} ${(b[1] - uy * inset).toFixed(1)}`;
}

function zigzag(segs: Pt[][]): string {
  let out = "";
  segs.forEach((s, i) => {
    const a = s[i % 2 ? 1 : 0];
    const b = s[i % 2 ? 0 : 1];
    if (!a || !b) return;
    out += `${i ? "L" : "M"}${a[0].toFixed(1)} ${a[1].toFixed(1)}L${b[0].toFixed(1)} ${b[1].toFixed(1)}`;
  });
  return out;
}

function blobPath(x: number, y: number, rad: number, r: Rng): string {
  const k = 9;
  const pts: Pt[] = Array.from({ length: k }, (_, i) => {
    const a = (i / k) * 2 * Math.PI;
    const rr = rad * (0.75 + r() * 0.45);
    return [x + Math.cos(a) * rr, y + Math.sin(a) * rr * 0.82];
  });
  const first: Pt = pts[0] ?? [x, y];
  const last: Pt = pts[k - 1] ?? [x, y];
  let d = `M${((first[0] + last[0]) / 2).toFixed(1)} ${((first[1] + last[1]) / 2).toFixed(1)}`;
  for (let i = 0; i < k; i++) {
    const p: Pt = pts[i] ?? [x, y];
    const q: Pt = pts[(i + 1) % k] ?? [x, y];
    d += `Q${p[0].toFixed(1)} ${p[1].toFixed(1)} ${((p[0] + q[0]) / 2).toFixed(1)} ${((p[1] + q[1]) / 2).toFixed(1)}`;
  }
  return d + "Z";
}

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
  engraving: "Etching the plate…",
  watercolor: "Letting the colours bloom…",
  ink: "Doodling your scene…",
};

export const DRAW_NOTE = "Usually about twenty seconds";
