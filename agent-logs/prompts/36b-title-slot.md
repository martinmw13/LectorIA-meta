# Task 36b: fixed title slot with a marquee, so the player icons never move

Same branch `music-still`, repo LectorIA-meta. Read AGENTS.md first and follow it: no secrets, core/ stays pure, never --no-verify, never run `next dev` or `next start`.

Problem: `.player-track` in `app/player.tsx` and `app/styles/player.css` sizes itself from the title (`flex: 1 1 auto; max-width: 300px`). A long or short track title therefore changes its width, and the music-style stickers, Chopin and rain icons shift. Martin prefers the title moving over the icons moving.

Do the following:
1. Give the title a fixed-width slot whose width never depends on its content. For example `.player-track { flex: 0 1 300px; width: 300px; min-width: 0; overflow: hidden }`. It may shrink with the viewport, but never with the text.
2. Inside the slot, wrap the current content in one inner span, e.g. `.player-track-inner`, `display: inline-block`, `white-space: nowrap`. The content is the head text plus the existing source link (` · artist ↗`).
   - Keep the source link exactly as it is: same markup, size, aria-label and title, still clickable. Do not remove or enlarge it.
   - Keep `aria-live="polite"`. Keep the slot's `title={now?.full}` tooltip, and make sure it holds the full name.
3. Marquee when the content overflows:
   - Measure with a small client hook or a `useLayoutEffect` plus `ResizeObserver` on the slot and the inner span, re-run when the track changes. Compute `shift = inner.scrollWidth - slot.clientWidth`.
   - If `shift > 0`, set `data-overflow="1"` on the slot and CSS variables `--marquee-shift: <shift>px` and `--marquee-duration`.
   - Animate the inner span slowly so it reveals the full name, pausing at both ends. Use keyframes: 0% to 15% at `translateX(0)`, 85% to 100% at `translateX(calc(-1 * var(--marquee-shift)))`, then `infinite alternate`, `linear`.
   - Base the duration on about 30 px/s for the moving part plus the pauses, with a minimum of about 6 s. Put the duration math in a tiny pure helper with a vitest test, e.g. `app/marquee.ts` with `marqueeDurationMs(shiftPx)`. Do not put it in core/.
   - While overflowing, add a soft fade on the right edge with `mask-image: linear-gradient(to right, #000 calc(100% - 16px), transparent)`.
   - With no overflow there is no animation and no mask.
4. Under `prefers-reduced-motion: reduce`, and also when the player has `data-reduced-motion="true"`:
   - no animation and no transform;
   - a static ellipsis: the inner span becomes `display: block; overflow: hidden; text-overflow: ellipsis`, or similar;
   - the full title stays in the `title` tooltip.
5. Do not touch the music-style control files, the rain files, audio logic or core/.
6. Add a short "Update 36b" section to docs/tasks/36-music-still.md.

Run `npx vitest run` and `npx tsc --noEmit`, then commit with the message `Fix the player title slot so the icons never move`. Report in 3 to 5 lines.
