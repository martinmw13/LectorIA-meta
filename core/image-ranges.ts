// Pure range logic for passage-picture reuse: an overlapping selection
// reuses a cached picture, a much larger or smaller one gets its own.
import { imageKey } from "./images";
import type { PassageRequest } from "./types";

export interface ParaRange {
  start: number;
  end: number;
}

// Reuse a cached picture when |A∩B|/|A∪B| over paragraphs is at least
// this; a much larger or smaller selection falls below and gets its own
// picture.
export const REUSE_JACCARD = 0.5;

// Bounds the per-scene lookup.
export const MAX_RANGES_PER_SCENE = 24;

export function jaccard(a: ParaRange, b: ParaRange): number {
  const inter = Math.max(0, Math.min(a.end, b.end) - Math.max(a.start, b.start) + 1);
  const union = a.end - a.start + 1 + (b.end - b.start + 1) - inter;
  return union <= 0 ? 0 : inter / union;
}

export function pickReusable(cached: readonly ParaRange[], want: ParaRange): ParaRange | null {
  let best: ParaRange | null = null;
  let bestScore = 0;
  for (const c of cached) {
    const score = jaccard(c, want);
    if (score >= REUSE_JACCARD && score > bestScore) {
      best = c;
      bestScore = score;
    }
  }
  return best;
}

// Parses the stored range list; drops garbage entries, never throws.
export function parseRanges(raw: string | null): ParaRange[] {
  if (!raw) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];
  const out: ParaRange[] = [];
  for (const item of parsed) {
    if (typeof item !== "object" || item === null || Array.isArray(item)) continue;
    const { start, end } = item as Record<string, unknown>;
    if (typeof start !== "number" || !Number.isInteger(start)) continue;
    if (typeof end !== "number" || !Number.isInteger(end)) continue;
    if (end < start) continue;
    out.push({ start, end });
  }
  return out;
}

export function addRange(list: readonly ParaRange[], r: ParaRange): ParaRange[] {
  if (list.some((e) => e.start === r.start && e.end === r.end)) return [...list];
  return [...list, r].slice(-MAX_RANGES_PER_SCENE);
}

// The scene's range list lives next to its images; built from imageKey's
// directory so the two never drift.
export function rangeListKeyFor(req: PassageRequest, sceneId: string): string {
  const key = imageKey(req);
  return `img:ranges:${key.slice(0, key.lastIndexOf("/"))}/${sceneId}`;
}
