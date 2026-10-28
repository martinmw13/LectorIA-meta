# Task 32: Pictures module owns figure placement, single-source copy and theme key

## What changed

- Figure placement moved to `app/folio/figure-placement.ts`, pure and
  framework-free: `groupFiguresByEndN`, `figuresAfter` (figures render
  after the last visible fragment of an ordinal on that page),
  `pageOfOrdinal`, plus the request gates `tryStart`/`finish`,
  `canStart`, `canRetryFigure`, `canIllustrateScene`.
  `app/leer/scene-page.tsx` calls them; the scroll and pulse stay there.
- `usePictures` takes `pref` as a hook argument (read through a ref, so
  callbacks stay stable) and returns the lightbox as
  `lightbox: { item, open, close }`. Ordering rules are listed in a doc
  comment at the top of `use-pictures.ts`. Only `scene-page.tsx` calls
  the hook, so it is the only caller updated.
- `app/folio/picture-copy.tsx` owns `PictureIcon` and `PICTURE_COPY`
  (`Sketching…`, `Try again`, `Remove picture`), used byte-identically by
  `image-pane.tsx` and `inline-figures.tsx`.
- `THEME_KEY` moved to `app/theme.ts`; `THEME_SCRIPT` interpolates it
  with `JSON.stringify` and evaluates byte-identical to before.
  `chrome.tsx` re-exports it, so `reader.tsx` needed no edit.

## Why

Placement and request rules were split across the hook and its caller
with no tests. Each now has one tested home; the DOM, classes, copy,
request bodies, and timing are unchanged.

## Checks

`npm test`, typecheck, build, `check:isolation`, `test:hooks`,
`check:size`, `check:secrets`.
