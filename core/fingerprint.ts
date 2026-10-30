// The one scene fingerprint: the pipeline records it in
// provenance.input and the server rejects a bookmap whose recorded
// input differs, so a re-segmented book with unchanged text never
// gets stale per-scene data. Pure: no env, no network, no files.
import { createHash } from "node:crypto";

export function fingerprint(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex").slice(0, 16);
}

export function classifyInputOf(
  scenes: { id: unknown; ch: unknown; start_n: unknown; end_n: unknown; title: unknown; summary: unknown; characters: unknown }[],
  textVersion: unknown,
): string {
  return fingerprint({
    textVersion,
    scenes: scenes.map((s) => ({ id: s.id, ch: s.ch, start_n: s.start_n, end_n: s.end_n, title: s.title, summary: s.summary, characters: s.characters })),
  });
}
