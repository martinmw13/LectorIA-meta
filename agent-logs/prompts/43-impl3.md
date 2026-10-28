# Task 43 round 3: review fixes, skin owner, six skins, popover anchoring

Worktree /workspace/wt-43, branch `picture-this-draw`, rebased on origin/main (PR #47 image styles and PR #48 skin owner `app/skin.ts` + `app/use-skin.ts` are merged). Read AGENTS.md, docs/tasks/43-picture-this-draw.md and docs/reviews/43.md. Another worker is rewriting the reader (`app/leer/scene-page.tsx`, pager, Begin gate) to continuous scroll: keep the diff inside the Picture this files (`app/folio/picture-*.ts(x)`, `image-pane.tsx`, `inline-figures.tsx`, `use-pictures.ts`, `app/styles/pictures.css`). Touch `scene-page.tsx` only if unavoidable, at most a line or two. Never stop to ask.

1. Review findings 1-3 in docs/reviews/43.md:
   - Reset `loaded` synchronously on url change (track url next to the flag, or key the ready branch by url). A cached-ready revisit shows frozen paper, then the reveal, with no reveal-class flash.
   - Add behaviour tests: passes accumulate and never wipe; under reduced motion the drawing is static, no rAF runs after mount, and the image takes the short fade; a ready url swap does not show the new image as revealed before its onLoad.
   - Fix the picture-draw.tsx header comment.
2. Use the skin owner. `app/folio/picture-skin.ts` stops reading data-skin and ?skin= itself and uses `useSkin()` from `app/use-skin.ts` / `getSkin()` from `app/skin.ts`. Do not edit app/skin.ts.
   - Final skins are engraving, watercolor, ink, graphite pencil, comic, and Chihiro (`anime-ghibli` in SKINS today; pencil is not in SKINS yet).
   - Add a small registry in picture-skin.ts that maps a skin id string to its drawing variant: engraving->engraving (etching needle, oval vignette, sepia then colour), watercolor->watercolor (blooming washes), ink->ink (ballpoint doodle), comic->ink, anime-ghibli and chihiro->watercolor, pencil/graphite/graphite-pencil->engraving, anything unknown->engraving.
   - The registry is the slot for each skin's own animation later: one entry to change, with a comment saying so. Expose the variant for drawing and CSS, plus the raw skin as `data-picture-skin` on the slot and button so per-skin CSS can be added later.
   - Unit-test the mapping.
3. Anchor the selection popover per scene without depending on page structure. Today use-pictures.ts computes the position relative to the text view's bounding box, and SelectionPopover is rendered inside the view, so it relies on that element being the positioned ancestor.
   - Make it independent: compute document coordinates from the selection range (rect + scroll offsets) and render SelectionPopover through a React portal into document.body with position:absolute, so it stays on the selected text however the reader lays out scenes (paged or continuous scroll, several scenes mounted at once).
   - Keep each scene's popover owned by that scene's hook instance (only the instance whose view holds the selection shows it). Hide it on resize, Escape, outside click and scene change, as today.
   - Keep the `pos/popRef/onPick` props so scene-page.tsx needs no change if possible.
   - Add a jsdom test for the position math and the portal target.
4. Make the selection popover pill boxless like the Picture this button: no border and no filled background. Use Meta-blue text and icon with a soft paper-coloured halo (e.g. text-shadow or a blurred backdrop), not a box, so it stays legible over text. It must still read as clickable: pointer, hover underline or nudge, focus-visible ring, aria-label "Picture this". Animate only on hover and press. Light mode, never purple.
5. Constraints that must still hold: ready freezes the drawing at once, the image mounts at once and the reveal is ≤ 900 ms. Nothing waits on a drawing pass. No idle infinite animations. Reduced motion is static with a ≤ 200 ms fade. Copy is English and warm, never "Generated". No Picture this on chapter covers. No secrets client-side.

Use `tdd` where it fits and `unslop` for comments, docs and commit messages. Run `npm test` and `npm run typecheck` with Node 22 (`export PATH=$HOME/.local/node22/bin:$PATH`). Do not run `next dev`/`next start` or network installs. No paid API calls. Make small commits. Add a "Round 3" section to docs/tasks/43-picture-this-draw.md and update the task 43 row in BUILT_DURING_HACKATHON.md. Do not push.
