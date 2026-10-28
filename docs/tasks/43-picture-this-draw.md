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
  passes accumulate and never wipe: outline first, then shading on
  top, appending further light layers past the base four. `frozen`
  renders the static still with no timers, so the drawing stops the
  instant the card turns ready. `usePictureLoaded(url)` resolves on
  `complete`/`onLoad` (`onError` too, as today). Reduced motion (or
  SSR) renders the static still with the tool resting, no timers.
- `app/folio/picture-button.tsx`: frameless `PictureButton`: mini
  skin art (from the prototype's `BTN_ART`) plus accent label.
  Motion only on `:hover` (glint/blob/wiggle) and `:active` press.
- `app/folio/image-pane.tsx`, `app/folio/inline-figures.tsx`: the
  `loading` phase renders `<PictureDraw>` inside the existing slot
  with `role="status"`; the `ready` phase keeps a frozen
  `<PictureDraw>` under the image until it loads, then plays the
  short skin reveal (<= 900 ms, one-shot) and removes the drawing.
  Buttons use `PictureButton`; the pair stacks vertically with no
  divider so it fits the narrow pane. `bare` covers still show no
  button. `PICTURE_COPY.loading` removed (no other users);
  retry/remove copy unchanged.
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

## Round 3

- `usePictureLoaded` keeps the url next to the flag and derives
  `loaded` from the pair, so a cached ready-to-ready swap resets
  in the same render: the new image waits for its own load, never
  flashes as revealed. Late events from a previous image cannot
  mark the new url loaded. Header comment now says the frozen
  still stays mounted under the image until load.
- `picture-skin.ts` no longer reads `data-skin` or `?skin=`
  itself; it maps the skin owner's value to a drawing variant
  (`pictureVariant`, typed `Record<SkinId, …>` over the final six
  skins after #51: comic->ink, chihiro->watercolor, pencil->engraving,
  unknown->engraving).
  One entry changes when a skin gets its own animation. The raw
  id rides as `data-picture-skin` on the slot and button for
  future per-skin CSS. `usePictureSkinId` exposes it.
- The selection popover computes document coordinates
  (`popoverPos`: rect plus page scroll) and renders through a
  portal into `document.body`, so it stays on the selection in
  paged or continuous layouts. Each scene's hook instance still
  owns its popover; resize also hides it. After the continuous
  reader (#53) the reader hides it on scene jumps and calls
  `rescan()` when a selection moves the current scene, so the hook
  no longer clears it on every scene id change (that would race
  the rescan).
- The popover is boxless: Meta-blue text and icon over a paper
  halo, underline on hover, press nudge, focus ring, still under
  reduced motion.

## Checks

`npm run typecheck` (one pre-existing error in `pipeline/kokoro.ts`:
missing optional `modal` types, present on the base tree too),
`npm test` (incl. the new accumulate, reduced-motion, url-swap,
variant-mapping and portal tests).
