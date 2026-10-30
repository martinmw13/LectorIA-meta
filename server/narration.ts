import "server-only";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parseBookNarration } from "../core/narration-book";
import type { NarrationChapterEntry } from "../app/narration/types";

// Small chapter map for the reader shell: each chapter's audio src and
// its manifest URL (src with .mp3 replaced by .json), one row per
// chapter and voice. The 1 MB chapter index never reaches the client;
// only this list ships. Books without a narration.json read silently.
export function loadNarrationEntries(bookId: string): NarrationChapterEntry[] {
  // Route params reach here, so only plain book ids may form the path.
  if (!/^[a-z]+$/.test(bookId)) return [];
  let raw: string;
  try {
    raw = readFileSync(join(process.cwd(), "data/books", bookId, "narration.json"), "utf8");
  } catch {
    return [];
  }
  let file: ReturnType<typeof parseBookNarration>;
  try {
    file = parseBookNarration(JSON.parse(raw) as unknown);
  } catch {
    return [];
  }
  const out: NarrationChapterEntry[] = [];
  for (const [voice, chapters] of Object.entries(file.chaptersByVoice)) {
    for (const [ch, manifest] of Object.entries(chapters)) {
      const n = Number(ch);
      if (!Number.isInteger(n)) continue;
      if (typeof manifest.src !== "string" || !manifest.src.endsWith(".mp3")) continue;
      out.push({ ch: n, voice, src: manifest.src, manifest: manifest.src.slice(0, -4) + ".json" });
    }
  }
  out.sort((a, b) => a.ch - b.ch || (a.voice < b.voice ? -1 : a.voice > b.voice ? 1 : 0));
  return out;
}
