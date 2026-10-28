# Task 53: continuous scroll reader

Native, momentum continuous scroll through the whole book. One route per
scene still (deep links, prerendering), but every route ships the book
as one long column: chapter header plus panels strip inline, then text,
scene after scene. No Begin gate, no sub-pages, no wheel or key
hijacking.

## What

- `app/leer/book-view.tsx`: the whole `ReaderModel` as chapters of
  `section[data-scene-id]` inside `.read-col`. One IntersectionObserver
  picks the scene most in view (`pickCurrentScene`); the id commits to
  state, a tiny store, and the URL via `replaceState`. Deep links
  scroll instantly to their section; the column focuses on load so
  Space/Page keys scroll natively. Pager and chapter jumps scroll to
  sections. Reading past a chapter unlocks its panels.
- `app/leer/scroll-helpers.ts`: `pickCurrentScene` (max ratio, ties
  keep order), `scrollToSceneId` (instant under
  `prefers-reduced-motion`), `followIntoView` plus `attachFollowPause`
  for the narration UI: scrolls a spoken word into a middle band only
  when outside it, never within 4 s of user input.
- `app/leer/current-scene.ts`: live scene store plus the
  `lectoria:goto-scene` event Reader uses for chapter jumps.
- `app/reader.tsx` reads the live id (route id is the first-load
  fallback); music `sceneEntered` keeps its gate and dwell semantics.
- `core/reader.ts` loses the paged model (`paginateScene`,
  `subPage*`, `navReducer`, `buildSceneView`, ...); `countWords` stays
  for the resplit pipeline. `scroll-turn.ts` and its test are gone.
- Pictures follow the scene in view (`usePictures` resyncs from its
  caches on scene change, late polls cannot paint another scene);
  selection in another scene moves the current scene and rescans, so
  the popover follows. Never offered on headings or the strip.
- CSS: `content-visibility: auto; contain-intrinsic-size: auto 1200px`
  on sections with a light break ornament; dead cover/end/read-on rules
  removed; lazy images on inline figures, vault thumbs, panel thumbs.
- `scripts/e2e-scroll.py` rewritten for the continuous asserts;
  `check-isolation` now checks every route carries the whole book.

## Why

Owner feedback: scrolling felt broken, and every chapter demanded a
Begin click before showing text. Native scroll restores momentum; the
text starts at once under the panels strip.

## Skipped

- `localStorage` resume of the last scene: URL deep links cover it.
- Dropping "Scene k of n" for noise: kept in the pager, out of the
  column.
