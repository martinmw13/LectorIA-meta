// Shared geometry for the Picture this drawings: the prototype's Oz
// house/cyclone scene as contours and fill regions, plus hatch and blob
// helpers. Pure data, no DOM.

export interface DrawStroke {
  d: string;
  stroke: string;
  width: number;
  opacity: number;
  fill?: string;
  blurred?: boolean;
}

export type Rng = () => number;

export function rng(seed: number): Rng {
  return () => {
    seed = (seed * 16807) % 2147483647;
    return (seed - 1) / 2147483646;
  };
}

export type Pt = [number, number];

export const R: Record<"sky" | "roof" | "wall" | "ground" | "funnel", Pt[]> = {
  sky: [[24, 26], [276, 26], [276, 160], [24, 160]],
  roof: [[86, 212], [150, 160], [214, 212]],
  wall: [[96, 212], [204, 212], [204, 280], [96, 280]],
  ground: [[24, 284], [276, 284], [276, 354], [24, 354]],
  funnel: [[236, 64], [290, 64], [262, 288], [250, 288]],
};

export const C: Record<
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

export const CONTOURS: (keyof typeof C)[] = [
  "ground", "wall", "roof", "door", "window", "chimney",
  "dorothy", "toto", "funnel", "cloud", "wind1", "wind2",
];

export const OVAL = "M150 26C230 26 282 100 282 190S230 354 150 354S18 280 18 190S70 26 150 26Z";
export const OVAL_INNER = "M150 34C224 34 274 104 274 190S224 346 150 346S26 276 26 190S76 34 150 34Z";

export function ovalPts(): Pt[] {
  return Array.from({ length: 28 }, (_, i) => [
    150 + 128 * Math.cos((i / 28) * 2 * Math.PI),
    190 + 160 * Math.sin((i / 28) * 2 * Math.PI),
  ]) as Pt[];
}

export function clip(poly: Pt[], p0: Pt, d: Pt): Pt[] | null {
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

export function hatch(poly: Pt[], deg: number, gap: number, jit: number, r: Rng): Pt[][] {
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

export function segD(seg: Pt[], inset = 2): string {
  const a = seg[0];
  const b = seg[1];
  if (!a || !b) return "";
  const L = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
  const ux = (b[0] - a[0]) / L;
  const uy = (b[1] - a[1]) / L;
  return `M${(a[0] + ux * inset).toFixed(1)} ${(a[1] + uy * inset).toFixed(1)}L${(b[0] - ux * inset).toFixed(1)} ${(b[1] - uy * inset).toFixed(1)}`;
}

export function zigzag(segs: Pt[][]): string {
  let out = "";
  segs.forEach((s, i) => {
    const a = s[i % 2 ? 1 : 0];
    const b = s[i % 2 ? 0 : 1];
    if (!a || !b) return;
    out += `${i ? "L" : "M"}${a[0].toFixed(1)} ${a[1].toFixed(1)}L${b[0].toFixed(1)} ${b[1].toFixed(1)}`;
  });
  return out;
}

export function blobPath(x: number, y: number, rad: number, r: Rng): string {
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
