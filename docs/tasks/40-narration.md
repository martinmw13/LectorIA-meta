# Task 40: chapter narration with Kokoro on Modal

Read-aloud narration for Oz and later uploads: one mp3 plus sentence
timings per chapter, voice `af_heart` at 0.95x, generated on a Modal
L4 function that scales to zero.

## What

- `core/narration.ts`: sentence split, chapter chunks with gaps, cache
  keys, strict manifest parse, `activeChunkAt`, `sceneSpan`, the
  owner's rolling window (`chaptersToPrepare`), estimate/actual cost
  in integer micro-dollars.
- `core/narration-cache.ts`: `ensureChapterNarration`, one flow for
  the offline run and the future upload route (index, store, lock,
  budget, synthesize).
- `pipeline/modal/narrate.py`: the `lectoria-narration` app, one
  `narrate` function (L4, scale-to-zero, 10 min timeout, 4
  containers). No secrets in the file.
- `pipeline/kokoro.ts`: Node client over the Modal SDK; strict shape
  check, one retry, generic errors.
- `pipeline/narrate.ts`: last pipeline step with Blob-or-local store
  under identical keys, in-process `NARRATION_CAP_USD` cap,
  concurrency 4, per-chapter lines plus a cost summary, resume-safe
  partial writes.
- `server/narration/cache.ts`: Redis index/lock plus Blob store plus
  dual-cap budget for the future route (no route yet).
- Contract in `docs/contracts/narration.md`.

## Why

The chapter is the narration unit (owner decision): one compact file
per chapter, scene playback by seek, sentence highlight from timings.
Content-addressed keys mean Oz is generated once and every later
reader of the same text gets it free; the same function serves
uploads later. The 2-ahead rolling window hides the Modal cold start
after chapter 1.
