import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { JevResult } from "./jev";

export function para(n: number, marker: string): { id: string; ch: number; n: number; text: string } {
  return { id: `c1p${n}`, ch: 1, n, text: `${marker} ${Array(59).fill("filler").join(" ")}` };
}

export function jevResult(vector: JevResult["vector"], choice: JevResult["choice"]): JevResult {
  return { vector, choice, confidence: 0.9, intensity: 0.5, intensity_confidence: 0.9, tempo: 0.5, tempo_confidence: 0.9, model: "jev-1.14.0", input_tokens: 100, output_tokens: 10 };
}

export const V = {
  meadow: { calma: 0.8, alegria: 0, tristeza: 0.2, suspenso: 0, misterio: 0, aventura: 0, combate: 0, asombro: 0, unknown: 0 },
  storm: { calma: 0.2, alegria: 0, tristeza: 0, suspenso: 0, misterio: 0, aventura: 0, combate: 0.8, asombro: 0, unknown: 0 },
  uneasy: { calma: 0.62, alegria: 0, tristeza: 0, suspenso: 0, misterio: 0, aventura: 0, combate: 0.38, asombro: 0, unknown: 0 },
  tense: { calma: 0.38, alegria: 0, tristeza: 0, suspenso: 0, misterio: 0, aventura: 0, combate: 0.62, asombro: 0, unknown: 0 },
  quiet: { calma: 0.9, alegria: 0.1, tristeza: 0, suspenso: 0, misterio: 0, aventura: 0, combate: 0, asombro: 0, unknown: 0 },
} as Record<string, JevResult["vector"]>;

export function setupDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "resplit-"));
  const paragraphs = [para(1, "meadow"), para(2, "meadow"), para(3, "storm"), para(4, "storm"), para(5, "uneasy"), para(6, "uneasy"), para(7, "tense"), para(8, "tense"), para(9, "quiet"), para(10, "quiet")];
  writeFileSync(
    join(dir, "book.json"),
    JSON.stringify({ id: "oz", title: "Oz", author: "A", source: { gutenberg: 55, url: "u" }, textVersion: "sha256:x", chapters: [{ ch: 1, title: "One", start_n: 1, end_n: 10 }], paragraphs }),
  );
  const scene = (id: string, start_n: number, end_n: number, vector: Record<string, number>) => ({
    id, ch: 1, start_n, end_n, title: id, summary: "s", characters: [],
    jev: null, muse_override: null, final: { vector, intensity: 0.5, tempo: 0.5 }, error: null,
  });
  writeFileSync(
    join(dir, "scenes.json"),
    JSON.stringify({
      bookId: "oz", textVersion: "sha256:x",
      scenes: [
        { id: "c1s1", ch: 1, start_n: 1, end_n: 4, title: "Mixed", summary: "s", characters: [] },
        { id: "c1s2", ch: 1, start_n: 5, end_n: 8, title: "Unsure", summary: "s", characters: [] },
        { id: "c1s3", ch: 1, start_n: 9, end_n: 10, title: "Quiet", summary: "s", characters: [] },
      ],
      provenance: { date: "d", meta: { model: "m", requests: 1, prompt_tokens: 1000, cached_tokens: 0, completion_tokens: 50, cost_usd: 0.001 } },
    }),
  );
  writeFileSync(
    join(dir, "analysis.json"),
    JSON.stringify({
      bookId: "oz", textVersion: "sha256:x",
      scenes: [
        scene("c1s1", 1, 4, { calma: 0.55, tristeza: 0.45, alegria: 0, suspenso: 0, misterio: 0, aventura: 0, combate: 0, asombro: 0 }),
        scene("c1s2", 5, 8, { calma: 0.4, combate: 0.35, tristeza: 0.25, alegria: 0, suspenso: 0, misterio: 0, aventura: 0, asombro: 0 }),
        scene("c1s3", 9, 10, { calma: 0.9, alegria: 0.1, tristeza: 0, suspenso: 0, misterio: 0, aventura: 0, combate: 0, asombro: 0 }),
      ],
      override_rate: 0,
      provenance: {
        date: "d",
        jev: { model: "jev-1.14.0", requests: 3, input_tokens: 300, output_tokens: 30, cost_usd: 0.0001 },
        meta: { model: "m", requests: 1, prompt_tokens: 1000, cached_tokens: 0, completion_tokens: 50, cost_usd: 0.001 },
        total_cost_usd: 0.0011,
      },
    }),
  );
  return dir;
}
