# Task 43: skin-matched "Picture this" drawing while the picture loads

Repo martinmw13/LectorIA-meta, worktree /workspace/wt-43, branch `picture-this-draw` (from latest main). Read AGENTS.md first and follow every repo rule (co-author trailer via the hook, 5k-token file-size hook, check:secrets, check:isolation). No paid API calls, do not run `next start`, do not touch data/, do not touch server/ or app/image-style.ts. Never stop to ask; make reasonable calls and note them. First write the design in docs/tasks/43-picture-this-draw.md (short), then implement.

## Reference prototype (approved by the user)
`.muse-ref/index.html` (+ `.muse-ref/assets/`) is a standalone prototype, not part of the repo (never commit `.muse-ref/`). It shows 6 variants; the user chose THREE:
- engraving skin -> variant **eB "Etching needle, oval vignette"** (needle scratches an oval plate + contours, then fine cross-hatching; picture comes up sepia, then full colour).
- watercolor skin -> variant **wA "Blooming washes"** (brush dabs, colour blooms bleed outward; picture comes in as a wash spreading from the middle, blur to sharp).
- ink skin -> variant **iA "Ballpoint doodle"** (blue ballpoint doodles contours, then zigzag shading; picture pops in blue ink, then colour).
Port those three faithfully (paper, tool glyph riding the stroke tip, strokes, SVG filters, reveal), as a React client component using SVG + requestAnimationFrame (no new dependencies). The prototype's Oz house/cyclone paths are fine as the stand-in sketch. Note the prototype's `Run.cut` getter: the drawing must stop wherever it is the moment the picture arrives.

## Behaviour
- When the user clicks Picture this, the image slot shows the blank skin paper IMMEDIATELY (no spinner), and the skin's tool starts drawing on it, looping layers until /api/images answers (~20 s). Applies to the left image pane (app/folio/image-pane.tsx, `loading` phase) and to inline figures (app/folio/inline-figures.tsx, `loading` phase): share one component.
- Never block on animation length: the instant the real image is ready, abort the drawing at whatever point it reached and reveal the image with a SHORT skin reveal (total <= ~900 ms; engraving: brief sepia then colour; watercolor: quick bloom from the centre; ink: quick pop). After the reveal only the image remains; nothing keeps moving. If the reveal can't be done cleanly within the existing ready-phase markup, a plain crossfade (<= 500 ms) from drawing to image is acceptable. Errors still show the existing error + retry.
- Status copy under/inside the slot, warm English, e.g. engraving "Etching the plate…", watercolor "Letting the colours bloom…", ink "Doodling your scene…", plus a small "Usually about twenty seconds". Never use the word "Generated". Keep `role="status"` for a11y. Replace PICTURE_COPY.loading usage accordingly (keep it if still used elsewhere).
- prefers-reduced-motion: no drawing animation; show the variant's static `still()` drawing with the tool resting, then a <= 200 ms opacity swap to the image.
- Picture this stays absent on chapter covers (`bare`) as today.

## Skin selection
A skin seam (data-skin attribute on <html>, `?skin=` param) is being built on another branch and is NOT in main. Add a tiny helper (e.g. app/folio/picture-skin.ts) `pictureSkin(): "engraving" | "watercolor" | "ink"` that reads `document.documentElement.dataset.skin`, else the `?skin=` URL param, else returns "engraving"; unknown values (including "default") -> "engraving". SSR-safe. Unit test it.

## The Picture this button (pane pill and the scene/chapter pair)
- Remove the box/frame: no border, no pill background. The illustration IS the button: a small skin-matched drawing (see the prototype's BTN_ART for engraving/watercolor/ink, Meta blue #0866FF accents) plus the label text, and it must still read clearly as clickable (cursor pointer, accent-coloured label, visible hover change, focus-visible ring kept).
- Animate ONLY on hover and on click/state change (e.g. a tiny press/glint/wiggle like the prototype's engrave-press, wet-press, wiggle keyframes). No idle loops anywhere on the button. Remove the infinite `pane-pulse` loading animation. Under prefers-reduced-motion: no button animation.
- Light mode, Meta blue (use existing --color-accent tokens), never purple. Keep labels "Picture this scene" / "Picture the chapter".

## Tests
- picture-skin helper test.
- A jsdom test (pattern: app/folio/use-pictures.test.tsx, createRoot + act, no new deps) that renders the loading slot, asserts the paper SVG and status render immediately, then flips to ready and asserts the image is rendered without waiting for the drawing to finish (fake timers ok; stub requestAnimationFrame / matchMedia / SVG getTotalLength as needed).

## Done when
`npm run typecheck`, `npm test`, `npm run check:secrets`, `npm run check:size`, `npm run check:isolation` and `npm run build` all pass. Keep every file under the size hook limit (split paths/data into their own module). Commit in sensible steps with clear messages; the hook adds the trailer. Add one short line for task 43 to BUILT_DURING_HACKATHON.md. Do not push.
