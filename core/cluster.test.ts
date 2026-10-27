import { describe, expect, it } from "vitest";
import { buildFeatures, kmeans, mulberry32 } from "./cluster";
import { EMOTIONS } from "./types";
import type { Vector8 } from "./types";

function vector(dominant: (typeof EMOTIONS)[number]): Vector8 {
  const v = {} as Vector8;
  for (const id of EMOTIONS) v[id] = id === dominant ? 1 : 0;
  return v;
}

const POINTS = EMOTIONS.flatMap((emotion, e) =>
  [0, 1, 2].map((i) => ({
    sceneId: `${emotion}-${i}`,
    features: buildFeatures({ vector: vector(emotion), intensity: e / 8 + i * 0.01, tempo: 0.5 }),
  })),
);

describe("kmeans", () => {
  it("is byte identical on repeat runs", () => {
    const a = JSON.stringify(kmeans(POINTS, 8));
    expect(JSON.stringify(kmeans(POINTS, 8))).toBe(a);
  });
  it("caps k at the point count and covers every scene once", () => {
    const clusters = kmeans(POINTS.slice(0, 3), 15);
    expect(clusters.length).toBe(3);
    const ids = clusters.flatMap((c) => c.points.map((p) => p.sceneId)).sort();
    expect(ids).toEqual(["calma-0", "calma-1", "calma-2"]);
  });
  it("seeded PRNG repeats its sequence", () => {
    const a = mulberry32(42);
    const b = mulberry32(42);
    expect([a(), a(), a()]).toEqual([b(), b(), b()]);
  });
});


