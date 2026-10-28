import "server-only";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { NarrationChapterEntry } from "../app/narration/types";

// Small chapter map for the reader shell: each chapter's audio src and
// its manifest URL (src with .mp3 replaced by .json). The 1 MB Oz index
// never reaches the client; only this list of chapters ships.
export function loadNarrationEntries(): NarrationChapterEntry[] {
  const raw = readFileSync(join(process.cwd(), "data/books/oz/narration.json"), "utf8");
  const json = JSON.parse(raw) as { chapters?: Record<string, { src?: string }> };
  const chapters = json.chapters ?? {};
  return Object.keys(chapters)
    .map(Number)
    .filter((ch) => Number.isInteger(ch))
    .sort((a, b) => a - b)
    .flatMap((ch) => {
      const src = chapters[String(ch)]?.src;
      if (typeof src !== "string" || !src.endsWith(".mp3")) return [];
      return [{ ch, src, manifest: src.slice(0, -4) + ".json" }];
    });
}
