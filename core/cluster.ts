// Deterministic k-means over scene features. Same input gives
// byte-identical output: seeded init, fixed restarts, sorted naming.
import { EMOTIONS, FEATURE_WEIGHTS } from "./types";
import type { EmotionId, Vector8 } from "./types";

export interface WeightedPoint {
  sceneId: string;
  features: number[]; // 8 vector values, then intensity, then tempo
}

export interface KmeansCluster {
  points: WeightedPoint[];
  centroid: number[];
  inertia: number;
}

export function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Intensity and tempo each weigh half an emotion slot, so mood still
// decides the grouping while energy breaks ties.
export function buildFeatures(input: { vector: Vector8; intensity: number; tempo: number }): number[] {
  const features = EMOTIONS.map((id: EmotionId) => input.vector[id]);
  features.push(input.intensity * FEATURE_WEIGHTS.intensity);
  features.push(input.tempo * FEATURE_WEIGHTS.tempo);
  return features;
}

function distance(a: number[], b: number[]): number {
  let sum = 0;
  for (let i = 0; i < a.length; i++) {
    const diff = (a[i] ?? 0) - (b[i] ?? 0);
    sum += diff * diff;
  }
  return sum;
}

function mean(points: WeightedPoint[]): number[] {
  const dims = points[0]?.features.length ?? 0;
  const centroid = new Array<number>(dims).fill(0);
  for (const point of points) {
    for (let d = 0; d < dims; d++) centroid[d] = (centroid[d] ?? 0) + (point.features[d] ?? 0);
  }
  return centroid.map((value) => value / points.length);
}

function kmeansPlusPlus(points: WeightedPoint[], k: number, rand: () => number): number[][] {
  const centroids: number[][] = [];
  centroids.push([...(points[Math.floor(rand() * points.length)]?.features ?? [])]);
  while (centroids.length < k) {
    const weights = points.map((p) => Math.min(...centroids.map((c) => distance(p.features, c))));
    const total = weights.reduce((a, b) => a + b, 0);
    if (total <= 0) {
      centroids.push([...(points[centroids.length % points.length]?.features ?? [])]);
      continue;
    }
    let pick = rand() * total;
    let chosen = points[points.length - 1]?.features ?? [];
    for (let i = 0; i < points.length; i++) {
      pick -= weights[i] ?? 0;
      if (pick <= 0) {
        chosen = points[i]?.features ?? [];
        break;
      }
    }
    centroids.push([...chosen]);
  }
  return centroids;
}

export function kmeans(
  points: WeightedPoint[],
  k: number,
  opts?: { seed?: number; restarts?: number; maxIter?: number },
): KmeansCluster[] {
  const seed = opts?.seed ?? 42;
  const restarts = opts?.restarts ?? 20;
  const maxIter = opts?.maxIter ?? 100;
  if (points.length === 0 || k <= 0) return [];
  const clampedK = Math.min(k, points.length);
  let best: KmeansCluster[] | null = null;
  for (let r = 0; r < restarts; r++) {
    const rand = mulberry32(seed + r);
    let centroids = kmeansPlusPlus(points, clampedK, rand);
    let assign = new Array<number>(points.length).fill(0);
    for (let iter = 0; iter < maxIter; iter++) {
      const next = points.map((p) => {
        let bi = 0;
        let bd = Infinity;
        centroids.forEach((c, i) => {
          const d = distance(p.features, c);
          if (d < bd) {
            bd = d;
            bi = i;
          }
        });
        return bi;
      });
      // An empty cluster restarts at the point farthest from its centroid.
      const counts = new Array<number>(clampedK).fill(0);
      for (const a of next) counts[a] = (counts[a] ?? 0) + 1;
      for (let c = 0; c < clampedK; c++) {
        if ((counts[c] ?? 0) === 0) {
          let far = 0;
          let farD = -1;
          points.forEach((p, i) => {
            const d = distance(p.features, centroids[next[i] ?? 0] ?? []);
            if (d > farD) {
              farD = d;
              far = i;
            }
          });
          centroids[c] = [...(points[far]?.features ?? [])];
          next[far] = c;
        }
      }
      const moved = next.some((a, i) => a !== assign[i]);
      assign = next;
      const groups = centroids.map((_, c) => points.filter((_, i) => assign[i] === c));
      centroids = groups.map((g, c) => (g.length > 0 ? mean(g) : (centroids[c] ?? [])));
      if (!moved) break;
    }
    const candidate: KmeansCluster[] = centroids.map((centroid, c) => {
      const members = points.filter((_, i) => assign[i] === c);
      const inertia = members.reduce((sum, p) => sum + distance(p.features, centroid), 0);
      return { points: members, centroid, inertia };
    });
    const total = candidate.reduce((sum, c) => sum + c.inertia, 0);
    if (best === null || total < best.reduce((sum, c) => sum + c.inertia, 0)) best = candidate;
  }
  return best ?? [];
}

// Dominant emotion index decides cluster order, then intensity.
export function dominantIndex(centroid: number[]): number {
  let best = 0;
  let bestValue = -Infinity;
  for (let i = 0; i < EMOTIONS.length; i++) {
    const value = centroid[i] ?? 0;
    if (value > bestValue) {
      bestValue = value;
      best = i;
    }
  }
  return best;
}
