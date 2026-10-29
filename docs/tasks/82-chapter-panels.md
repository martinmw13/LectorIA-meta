# 82: chapter in panels, one comic page per chapter

"Picture the chapter in panels" generated nothing: the modal showed
per-scene pictures from the session cache, two bundled files, or
placeholders. Martin's decision: one image per chapter that holds every
panel as a comic page. One call is cheaper and faster than one per
scene, and the panels share one style.

## Server

- New request kind `chapter`: `{ kind, bookId, textVersion, ch, style? }`,
  parsed strictly like `scene`. `ch` must be a chapter of the frozen book.
- Same route and the same `orchestrate` pass as scenes: index hit, Blob
  backfill, lock, quota, global and daily spend caps, generate, save,
  index. A chapter page counts as one image against the daily quota and
  costs one image (`IMAGE_COST_MICRO`). Hits are instant and free.
- Cache key `images/<book>/<textVersion>/<PROMPT_VERSION>/[<style>/]chapter-<ch>-<CHAPTER_PROMPT_VERSION>.webp`.
  The chapter prompt has its own version, so changing it never touches
  scene or passage keys.

## Panels and prompt

- `chapterPanels(scenes)` in `core/panels.ts` is the one grouping rule,
  used by the reader route (captions) and the prompt (descriptions).
  Up to 6 panels. A chapter with more scenes merges adjacent scenes into
  6 contiguous groups, sizes as even as possible, larger groups first.
  A group's description joins its scene summaries; its caption is
  `panelCaption` of its first scene's summary.
- Fixed layout by panel count, rows top to bottom:
  1 `[1]`, 2 `[1,1]`, 3 `[1,2]`, 4 `[2,2]`, 5 `[2,1,2]`, 6 `[2,2,2]`.
- The prompt names the layout, numbers the panels in reading order
  (left to right, top to bottom), describes each panel from its group,
  adds the illustration style line (same style rules as scenes), and
  says plainly: no text, letters, numbers, captions, sound effects or
  speech balloons anywhere. Same model as scenes (`muse-image-1.0`).

## Client

- The modal shows the page image and, under it, the captions as an
  ordered list in reading order. Captions are HTML, never in the image.
- Opening the modal requests the page in the reader's current style.
  Session cache per chapter and style, so reopening never refetches.
- Loading shows the skin drawing in the page frame with the skin status
  line from `DRAW_STATUS` as a caption under it. Errors show the server
  message with Try again.
- Spoiler gate: the page and captions only load for a chapter the reader
  has reached (high-water mark of the chapter in view this visit, the
  same reach that shows its panels entries). A chapter past it shows a
  short "Read up to this chapter first" note and requests nothing.

## Pregeneration

`scripts/pregen-chapters.ts` fills the cache offline through the same
key, index, and spend counters. `--ch 1,2` or `--ch all`, `--style` one
of the skin defaults or `skins` for all six, `--dry-run` prints the
count and expected USD and spends nothing. Cached pages are skipped and
the global cap applies.
