# Task 25b: rain button stays still and has no box

Branch `rain-still`, repo LectorIA-meta. Read AGENTS.md first and follow it (no secrets, core/ stays pure, never --no-verify, never run `next dev`/`next start`). This follows the merged rain ambience (docs/tasks/25-rain-ambience.md, PR #29). Only touch `app/rain-button.tsx`, `app/styles/ambience.css`, their tests if needed, and a short "Update 25b" section at the end of docs/tasks/25-rain-ambience.md. Do not change audio behaviour, levels, labels, prefs, the volume slider, or any other button.

Owner rules (Martin):
1. No idle animation. Drops must not fall continuously and the bolt must not flash on its own. Today `.rain-drop` runs `rain-drop-fall` infinitely and `.rain-bolt` runs `rain-bolt-flash` every 5 s; remove both idle loops.
2. Animate only (a) while the pointer hovers the button and (b) briefly after a click / level change (about one drop cycle, ~1.4 s, and one bolt flash in storm), then return to still. Implement (b) with a short-lived data attribute such as `data-anim="1"` set in `cycle()` and cleared by a timeout (clear the timeout on unmount and restart it on rapid clicks so the animation replays). Hover animation runs only while hovered (`:hover` on devices with `@media (hover: hover)`). The still frame must look right: drops visible at rest position, bolt visible at rest opacity.
3. No box, frame or filled container around the button. The cloud icon itself is the button: override the shared `.player .skip` border, border-radius look, background and box-shadow for `.skip.rain` (border: none; background: transparent; no box-shadow halo). Keep the 34px hit area so it stays easy to click.
4. Keep the level color cue without a box: move the celeste / yellow / red halo onto the icon itself, e.g. `filter: drop-shadow(0 0 3px <level color>)` on the svg (soft glow around the cloud), with the same CSS variables `--rain-drizzle`, `--rain-moderate`, `--rain-storm`. Off stays a 40% opacity outline with no glow. Keep the 200 ms transitions.
5. Focus ring only on keyboard focus: `.skip.rain:focus-visible { outline: 2px solid var(--color-accent); outline-offset: 2px; border-radius: 6px }` and no outline on `:focus:not(:focus-visible)`.
6. `prefers-reduced-motion: reduce` disables hover and click animations too.

Tests: add or extend a test that renders nothing browser-specific if the repo has no DOM test setup; at minimum keep all tests passing. If a DOM test environment already exists (check vitest config), add a test that `data-anim` is set after a click and cleared after the timeout with fake timers.

Run `npx vitest run` and `npx tsc --noEmit`, then commit with message `Keep the rain button still and frameless` (hook adds the trailer). Report in 3-5 lines.
