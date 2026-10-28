# Task 43: skin-matched "Picture this" drawing while the picture loads

## What changed

- `app/folio/picture-skin.ts`: `pictureSkin()` reads
  `document.documentElement.dataset.skin`, else the `?skin=` URL
  param, else `"engraving"`; unknown values (including `"default"`)
  fall back to `"engraving"`. SSR-safe (no document returns the
  default). `usePictureSkin()` returns `"engraving"` on first paint
  and upgrades in an effect, so SSR HTML never mismatches.
- `app/folio/picture-draw-paths.ts`: pure data builders. Ports the
  prototype's Oz house/cyclone stand-in sketch (regions `R`,
  contours `C`) plus seeded `hatch`/`zigzag`/`blobPath` geometry.
  `strokesForSkin(skin, layer)` returns layer 0 contours (engraving
  adds the oval plate) then cycling hatch layers; `stillStrokes`
  for reduced motion; `DRAW_STATUS` per-skin copy.
- `app/folio/picture-draw.tsx`: `PictureDraw` client component.
  Paper SVG per skin, strokes revealed one by one with `pathLength=1`
  dash animation and a small tool glyph riding each stroke tip,
  looping layers until unmounted. The parent unmounts it the moment
  the image is ready, which is the `Run.cut` behaviour: the drawing
  stops wherever it is. Reduced motion (or SSR) renders the static
  still with the tool resting, no timers.
- `app/folio/picture-button.tsx`: frameless `PictureButton`: mini
  skin art (from the prototype's `BTN_ART`) plus accent label.
  Motion only on `:hover` (glint/blob/wiggle) and `:active` press.
- `app/folio/image-pane.tsx`, `app/folio/inline-figures.tsx`: the
  `loading` phase renders `<PictureDraw>` inside the existing slot
  with `role="status"`; the `ready` phase puts a short skin reveal
  class (<= 900 ms, one-shot) on the image. Buttons use
  `PictureButton`; the pair loses its pill frame. `bare` covers
  still show no button. `PICTURE_COPY.loading` removed (no other
  users); retry/remove copy unchanged.
- `app/styles/pictures.css`, `app/styles/chapters.css`: drawing
  slot, reveal keyframes, frameless button styles; the infinite
  `pane-pulse` loading animation is gone. All new motion is off
  under `prefers-reduced-motion`.

## Why

The ~20 s image wait showed a pulsing grey box. Now each skin
draws on its own paper at once, and the real image only needs a
short skin-tinted arrival (sepia lift, wash bloom, ink pop) or a
plain crossfade under 500 ms.

## Checks

`npm run typecheck`, `npm test` (incl. `picture-skin.test.ts`
and `picture-draw.test.tsx`), `npm run check:secrets`,
`npm run check:size`, `npm run build`, `npm run check:isolation`.

## Calls made without asking

- Reveal lives on the `ready`-phase image as one-shot CSS
  (sepia/blur/pop, each <= 900 ms) over the existing markup,
  instead of keeping the drawing mounted under the image.
- No SVG turbulence/displacement filters in the drawing: grain is
  one static `feTurbulence` rect, watercolor blooms use a soft
  blur; the prototype's animated `f-wc`/`f-wet` washes were too
  heavy for a loading slot. (shortcut: filter fidelity; upgrade
  only if the stills look flat.)
