# Task: port the approved button motion into the app 1:1 (LectorIA reader)

Repo: this worktree (Next.js 16, React, TypeScript, vitest). Skin is `html[data-skin]`
(engraving | watercolor | ink | pencil | comic | chihiro). Read `app/button-fx.tsx`,
`app/folio/music-style-control.tsx`, `app/narration/read-aloud.tsx`, `app/rain-button.tsx`,
`app/styles/motion-*.css`, `app/globals.css`, `app/button-motion.test.ts` first.
Reference material (read-only, do NOT commit, do NOT import): `.muse-ref/`.

Hard rules
- Every source file must stay under 5000 tokens (~18 KB). Split into new files instead of growing one.
- Light UI, Meta blue #0866FF (dark #0A3F9E, light #8DB8FF). Never purple.
- Motion only on hover, click, or state change. Nothing loops idly; everything rests still.
- `prefers-reduced-motion: reduce` => no motion at all (no animation, no transition) for anything you add.
- Hover rules go inside `@media (hover: hover)`.
- Do not change copy/labels. Do not add dependencies. No secrets anywhere.
- Keep existing tests passing; update/add assertions in `app/button-motion.test.ts`
  (or a new `app/music-fx.test.ts`) that pin the new values by reading source files, like the existing tests.

## 1. Classic-skin music effects (engraving, watercolor, ink) — NEW
Port `.muse-ref/music-fx.inject.html` (approved by the product owner) into React:
- New client component, e.g. `app/folio/classic-music-fx.tsx`, `<ClassicMusicFx mode="orchestra"|"piano"|"chopin" />`,
  rendered inside each music button in `music-style-control.tsx` next to `<ButtonFx kind="music" />`.
  It returns null unless the skin is engraving, watercolor or ink. Mode: the Chopin/playlist button is "chopin";
  a style whose id or label matches /piano/i is "piano"; otherwise "orchestra".
- Same markup as the prototype: `<svg class="mfx sk-<skin>" viewBox="-40 -50 180 160" aria-hidden>` with a `<g class="h">`
  (hover notes for that mode, from `note()`/`pair()` exactly as in the prototype JS) and a `<g class="c">` (click signature
  for that mode: orchestra swirls + ride notes, piano keys + pop notes, chopin ring(s) + burst notes) and, for chopin,
  the ink `.keep` circle on the CIRC path. Per-skin defs (hatch pattern, wash/blur filters, wobble filter) must use
  ids made unique with React `useId()` so several buttons on the page do not collide.
- CSS in a new `app/styles/motion-music-classic.css` imported from `app/globals.css` beside the other motion files.
  Port the prototype CSS, re-targeted:
  - overlay sizing: the svg is absolutely positioned over the button image: left:-40%; top:-50%; width:180%; height:160%;
    pointer-events:none; overflow:visible; z-index above the img. Ensure the button is position:relative and
    the overlay is not clipped (overflow visible on the button/frame chain for these skins).
  - hover: `:is(.sticker,.chopin):hover .mfx .h > ...` (rise/step/pair with the prototype durations, delays, easing;
    watercolor uses the longer 1.25s durations exactly as in the prototype).
  - click signature plays on a new `data-burst` attribute on the button (see 3), same keyframes/delays as prototype `[data-burst]`.
  - ink keep circle: `html[data-skin="ink"] .chopin[aria-pressed="true"] .mfx .keep` stays drawn (opacity 1, dashoffset 0),
    and draws in with `mfx-keep .9s ease .05s` when the burst starts. It disappears when chopin is no longer current.
  - reduced motion: `.mfx .h, .mfx .c {display:none}` and `animation:none!important; transition:none!important`
    on every .mfx descendant (the ink keep circle may stay visible, static).
- PIANO KEYS FIX: in the prototype the piano signature keys sit at y=-34 (above the art) and in the app they overlap the
  reader footer/top edge of the player bar. Move the whole keyboard INSIDE the art box (0..100 in viewBox units): keep the
  7 white keys (13 wide) + 5 black keys (8 wide, fill dark blue) spaced by 15.4 but place them so the white keys span
  y=76..98 and black keys y=76..89 (x from -4 as before, so they span roughly -4..105), and make the pop notes rise from
  just above the keys (start y≈66..70) instead of y≈-38. Nothing of the click signature may go above y=-8 or below y=104.

## 2. Chihiro wind (gust) — MISSING TODAY
`motion-pencil.css` already animates `.fx .gust` but `ButtonFx` never renders it. In ButtonFx's chihiro theme extra,
render the clear-day gusts AND keep the lantern fireflies (product owner wants both). Verbatim from `.muse-ref/clear-day-js.txt` `fx:`:
`<path class="gust" style="--i:0" pathLength="1" d="M4 44c18-10 34 4 52-2s26-12 38-4" fill="none" stroke="#7CC6BA" stroke-width="2.6" stroke-linecap="round"/>`,
`<path class="gust" style="--i:1" pathLength="1" d="M20 62c14-6 26 2 40 0s22-8 30-2" fill="none" stroke="#A9D8F2" stroke-width="2.2" stroke-linecap="round"/>`,
`<path class="glint" style="--i:2" d="M118 26c3 4 8 4 10 0-4-1-7 1-10 0z" fill="#D2452E"/>` (the red leaf).
Check that the existing gust CSS matches the prototype: `stroke-dasharray:1; animation: gust .8s var(--ease) calc(var(--i)*90ms)`
with keyframes `0%{opacity:0;stroke-dashoffset:1}30%{opacity:.95}100%{opacity:0;stroke-dashoffset:-1}`.

## 3. Click replays even right after hover — BUG
Today hover and the `data-anim` click flag use the same animation name on the same element, so when the pointer is already
over the button (it always is when clicking) the click does not replay anything. The prototype re-renders the button on click.
Fix generically: the owner component keeps a burst counter that increments whenever a button's state changes
(music button becomes current, read aloud toggles, rain level changes, picture press) and passes it as a React `key`
to `<ButtonFx>` (and `<ClassicMusicFx>`), so the overlay remounts and the animations restart. Also add `data-burst="1"`
on the button for BURST_MS = 1800 (separate from the existing 600 ms `data-anim`, which must keep working for the image pop).
Skip the first render exactly like `data-anim` does (restoring prefs on load stays still).

## 4. Read-aloud sound waves while reading — MISSING (pencil + chihiro)
Prototype (`.muse-ref/clear-day-js.txt`, `art('narr', s)`): when narration is ON a second, persistent
`<svg class="fx waves" viewBox="0 0 136 136" aria-hidden>` with the 3 WAVES paths (stroke #0866FF, width 3.2, round caps,
`style="--i:i"`) is drawn over the book, and it animates in once on the state change:
`.just .waves path{animation:wave2in .5s var(--ease) calc(var(--i)*90ms) both}`,
`@keyframes wave2in{from{opacity:0;transform:translateX(-5px)}to{opacity:1;transform:none}}`, `.waves path{transition:opacity .3s,stroke .3s}`.
Port it in `ButtonFx` (e.g. prop `on`) or read-aloud.tsx for pencil and chihiro: visible and still while
reading (`aria-pressed`/on), wave2in plays on the transition to on (use the data-burst/data-anim flag), hidden when off.
The existing hover `.wave2` particles stay. Reduced motion: shown statically, no animation.

## 5. Verify
`export PATH=/workspace/n22bin:$PATH; npm run lint && npx tsc --noEmit && npx vitest run` must all pass.
Do not start or kill any server. Do not run git commit/push. Summarise the files you changed at the end.
