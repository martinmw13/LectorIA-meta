# Task 36: music-style control stays still and frameless

Branch `music-still` (from main after PR #35), repo LectorIA-meta. Read AGENTS.md first and follow it: no secrets, core/ stays pure, never --no-verify, never run `next dev` or `next start`. Only touch:
- `app/folio/music-style-control.tsx` and `app/styles/music-style-control.css`, which are the swap point;
- a new test file `app/folio/music-style-control.test.ts`;
- a new `docs/tasks/36-music-still.md` (short).

Do not change `MusicStyleControlProps`, `onAdvance` calls, labels, aria-pressed semantics, the player, core/ or any audio behaviour. This applies the same owner rule as the rain button (see `app/rain-button.tsx` and `app/styles/ambience.css`, update 25b, for the pattern).

Owner rules (Martin) for the Orchestra and Piano stickers and the Just Chopin! button:
1. Nothing animates at rest. There are no keyframe loops today; keep it that way.
2. Animation plays only:
   - on hover, inside `@media (hover: hover)`, using the existing tilt-to-0 and lift transition. Move the `:hover` rules inside that media query;
   - briefly on click or mode change, then everything returns to still. Add a one-shot keyframe "pop" (about 400 ms, e.g. scale 1 to 1.12 to 1 with the rotation settling to 0) on the button whose mode just became current. Drive it with a short-lived `data-anim="1"` on that button:
     - set it from a `useEffect` on `current`, so a session-driven change (Chopin toggle-back) also animates;
     - skip the first render, so restoring prefs on load does not animate;
     - clear it with a timeout of about 450 ms, clear the timeout on unmount, and restart it on rapid changes.
3. No box: no border, no background, no box-shadow and no frame ring around any of the three buttons. The icon itself is the button.
   - Stickers already have `border: 0; background: none`. Keep the sticker's white die-cut and its soft drop-shadow on the img: those are the icon's own shape, not a box.
   - For `.player .chopin`, remove the 2px border, including the transparent one and the accent-colored hover border. Also remove the pressed-state outline ring and its `scale(1.05)`.
   - Show the Chopin pressed state the same way as the stickers: wrap the Chopin button in a `.sticker-wrap` with a `.sticker-dot` after it, so it gets the accent dot when `aria-pressed="true"`.
   - Make inactive Chopin match inactive stickers: `opacity 0.85` and a slightly desaturated look. Pressed and hover use full opacity and saturation.
   - The round portrait keeps its `border-radius: 50%` on the img.
4. Hit area at least 34 px: stickers are 40 px and Chopin is 40 px or more; keep that and do not shrink it.
5. The focus ring shows only on keyboard focus. Give `.sticker` and `.player .chopin`:
   - `:focus-visible { outline: 2px solid var(--color-accent); outline-offset: 2px; border-radius: 6px }` (Chopin may use 50%);
   - `:focus:not(:focus-visible) { outline: none }`.
   No outline may be shown for the pressed state.
6. `@media (prefers-reduced-motion: reduce)` disables the hover transform and transition, the pop keyframes and any transform on the three buttons.

Tests: the repo has no DOM test setup. Add a source-level test like `app/rain-button.test.ts` that pins the following:
- no `infinite`;
- hover rules are inside `@media (hover: hover)`;
- `[data-anim]` animation rules exist;
- no `border:` other than 0 or none on `.chopin`;
- no `outline` in the `[aria-pressed="true"]` rules;
- `:focus-visible` exists;
- the reduced-motion block disables the animation.
Keep all tests passing.

Run `npx vitest run` and `npx tsc --noEmit`. Then commit with the message `Keep the music-style control still and frameless`; the hook adds the trailer. Report in 3 to 5 lines.
