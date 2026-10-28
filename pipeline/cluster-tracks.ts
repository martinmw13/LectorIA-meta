// Step 4: cluster classified scenes into about 15 track prompts.
// No network in this step and no audio code anywhere.
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { buildFeatures, dominantIndex, kmeans } from "../core/cluster";
import type { WeightedPoint } from "../core/cluster";
import { bpmRange, buildTrackPrompt } from "../core/music-prompt";
import { EMOTIONS, FEATURE_WEIGHTS } from "../core/types";
import type { AnalyzedScene, Book, EmotionId } from "../core/types";
import { clusterKeys, decide } from "./freshness";
import type { StepCtx } from "./ingest";

const SEED = 42;

export async function runCluster(ctx: StepCtx): Promise<void> {
  const book = JSON.parse(readFileSync(join(ctx.dir, "book.json"), "utf8")) as Book;
  const analysis = JSON.parse(readFileSync(join(ctx.dir, "analysis.json"), "utf8")) as {
    scenes: AnalyzedScene[];
  };
  const outPath = join(ctx.dir, "music-clusters.json");
  const keys = clusterKeys(ctx.dir);
  if (decide(ctx.force, keys.recorded, keys.current).reuse) return;
  const classified = analysis.scenes.filter((s): s is AnalyzedScene & { final: NonNullable<AnalyzedScene["final"]> } => s.final !== null);
  const byId = new Map(classified.map((s) => [s.id, s]));
  const unclustered = analysis.scenes.filter((s) => s.final === null).map((s) => s.id);
  const points: WeightedPoint[] = classified.map((s) => ({
    sceneId: s.id,
    features: buildFeatures({ vector: s.final.vector, intensity: s.final.intensity, tempo: s.final.tempo }),
  }));
  const k = Math.min(15, points.length);
  const clusters = kmeans(points, k, { seed: SEED, restarts: 20, maxIter: 100 })
    .map((cluster) => {
      const intensity = Math.min(1, Math.max(0, (cluster.centroid[8] ?? 0) / FEATURE_WEIGHTS.intensity));
      const tempo = Math.min(1, Math.max(0, (cluster.centroid[9] ?? 0) / FEATURE_WEIGHTS.tempo));
      return { cluster, intensity, tempo, dominant: dominantIndex(cluster.centroid) };
    })
    .sort((a, b) => a.dominant - b.dominant || a.intensity - b.intensity)
    .map(({ cluster, intensity, tempo }, index) => {
      const vector = Object.fromEntries(EMOTIONS.map((id, i) => [id, cluster.centroid[i] ?? 0]));
      const ranked = (Object.entries(vector) as [EmotionId, number][]).sort((a, b) => b[1] - a[1]);
      const scenes = cluster.points
        .map((p) => byId.get(p.sceneId))
        .filter((s) => s !== undefined)
        .sort((a, b) => a.start_n - b.start_n)
        .map((s) => s.id);
      return {
        id: `t${String(index + 1).padStart(2, "0")}`,
        size: cluster.points.length,
        centroid: { vector, intensity, tempo },
        dominant: ranked.slice(0, 2).map(([id]) => id),
        bpm: bpmRange(tempo),
        scenes,
        prompt: buildTrackPrompt({ top: ranked.slice(0, 3).map(([id, weight]) => ({ id, weight })), intensity, tempo }),
      };
    });
  writeFileSync(
    outPath,
    `${JSON.stringify({ bookId: book.id, textVersion: book.textVersion, k, seed: SEED, feature_weights: FEATURE_WEIGHTS, clusters, unclustered, provenance: { date: new Date().toISOString(), input: keys.current } })}\n`,
  );
}
