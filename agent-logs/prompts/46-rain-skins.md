# Task 46: rain button in three skins (engraving, watercolor, ink), keyed by data-skin

Repo LectorIA-meta, worktree /workspace/wt-seam, branch `rain-skins` (from main, which now has the skin seam from task 31: app/skin.ts, app/icons.tsx, app/tokens.css skin layer, `data-skin` on <html>). Follow AGENTS.md and repo rules. Never run `next start` or `next dev`. Do not push.

## Goal
Martin approved the rain-button v2 prototypes. Port them into the production rain button (app/rain-button.tsx + app/styles/ambience.css), one look per skin, resolved through the icon registry by `data-skin`. Reference (read-only, do NOT commit, it is git-excluded): `.muse-ref/page.html` (CSS: per-skin tokens, keyframes, hover/state-change motion, reduced motion), `.muse-ref/rain.js` (the SVG for each skin x state, viewBox 0 0 100 100), `.muse-ref/defs.svg` (patterns/filters/gradients it references), `.muse-ref/lluvia-v2-all.png` (how it must look).

Only the rain button changes. Every other pixel of the app must stay identical (fonts, tokens, other icons, player layout).

## 1. Skins
- app/skin.ts: `SKINS = ["engraving", "watercolor", "ink"] as const`, `DEFAULT_SKIN = "engraving"` (Denslow fits Oz; default until a skin switcher exists). Keep `isSkinId`. Update app/skin.test.ts.
- app/tokens.css: the skin layer currently sits under `:root, html[data-skin="default"]`. Make it apply to every skin with values byte-identical (e.g. `:root, html[data-skin]`), update the header comment. No value changes.
- Temporary test param `?skin=watercolor|ink|engraving`: add a tiny inline script (next to THEME_SCRIPT, e.g. `SKIN_SCRIPT` in app/skin.ts, rendered in app/layout.tsx before paint) that reads `location.search`, and if `skin` is a valid SkinId sets `document.documentElement.dataset.skin`; anything else is ignored (server default stays). Wrap in try/catch. Not persisted. Comment it as temporary until the skin switcher. Unit-test the script with a fake document/location like theme.test.ts does (valid value applied, invalid ignored, no param leaves default).

## 2. Icon registry
- app/icons.tsx: rename the current default set to a base set used as the fallback for all skins (`ICON_SETS[skin]?.[name] ?? BASE_ICONS[name]`); existing icons render byte-identical markup for every skin. Add icon names `rain-off`, `rain-drizzle`, `rain-moderate`, `rain-storm` with one def per skin (engraving, watercolor, ink), ported from rain.js states 0..3. Convert the template strings to JSX (no dangerouslySetInnerHTML). Keep geometry, viewBox 0 0 100 100, and the class hooks the CSS needs (halo, etch, drop with `--i` style, bolt, shim, bloom, wet, draw, face wrapper as needed). If a file grows past the size hook, put the rain art in `app/icons-rain.tsx` and register it from icons.tsx.
- Defs: the patterns/filters/gradients in defs.svg must be available where the rain SVG renders. Prefix all ids with `rb-` (e.g. `rb-hatch`, `rb-f-wc`) to avoid collisions, and render them inside the rain svg's own `<defs>` (only one rain button exists). Only include defs the current skin uses.
- Colours: move the hard-coded ink/paint colours out of attributes into CSS custom properties consumed by classes in ambience.css (per skin under `html[data-skin="x"] .player .skip.rain`), so dark theme can override them: add `html[data-skin="x"][data-theme="dark"]` overrides that keep the art legible on the dark player bar (e.g. engraving ink #2A241C becomes a warm light tone like #E9DFC6; ink-doodle blue lightens a bit; watercolor line lightens; halos/bolt colours stay). Light theme uses the prototype colours.
- app/rain-button.tsx: remove its inline <svg>; render `<Icon name={`rain-${level}`} skin={skin} ... />` wrapped in the face span the CSS animates. `skin` comes from `document.documentElement.dataset.skin` read on mount (useEffect / useSyncExternalStore; server render uses DEFAULT_SKIN so hydration matches), validated with isSkinId. Remove `rain-button.tsx` from the icons.test.ts allowlist (player.tsx stays). Add a registry test: every rain name resolves to a skin-specific def for every skin.

## 3. Keep exactly (do not touch the logic)
- Audio engine, AmbienceController, prefs load/save, unlock-on-first-gesture, mute, cycle order, labels/aria-label/title, the volume slider and its styles.
- The 34px hit area (`.skip` sizing) and the existing focus ring rule (`.player .skip.rain:focus-visible { outline: 2px solid var(--color-accent); outline-offset: 2px; border-radius: 6px }` and the `:focus:not(:focus-visible)` rule). Boxless: no border/background/box-shadow on the button.
- The player layout must not move: the art renders at about 30px inside the 34px button with `overflow: visible`, so halos may bleed out visually without changing layout box sizes.

## 4. Motion (from page.html, adapted to `.player .skip.rain`)
- Still at rest. Nothing loops (no `infinite`). On first page load nothing animates.
- State change (click): the per-skin entrance (engraving coin-in + etch stroke-in; watercolor wet-in + bloom; ink pop-in + draw), plus drops drip and bolt flash. Gate it on the existing `data-anim` attribute + the `key={burst}` remount, so it plays only after a click, never on mount.
- Hover: only inside `@media (hover: hover)`: drops drip once, bolt flicker, halo turns 7.5deg; engraving shimmer, watercolor bleed, ink wiggle.
- Reduced motion: `@media (prefers-reduced-motion: reduce)` disables all rain animations and transitions (a 200ms opacity fade on state change is allowed, nothing else).
- Per-skin motion tokens (`--m-state`, `--m-draw`, `--ease`) scoped to the rain button, named `--rain-m-state` etc. so they don't leak into app tokens.
- Remove the old glow drop-shadow / old cloud styles that no longer apply; keep the `--rain-*` level colours only if used.

## 5. Tests and docs
- Rewrite app/rain-button.test.ts to pin the new contract from sources: no `infinite`; hover animations only under `@media (hover: hover)`; state-change animations keyed on `[data-anim]`; reduced-motion block disables them; boxless rule; focus-visible and focus:not(:focus-visible) rules unchanged; button renders `<Icon` with `rain-${level}` and no inline svg; data-anim set on click and cleared with cleanup (keep that existing test).
- docs/tasks/46-rain-skins.md: what changed, the three looks, how `?skin=` works and that it is temporary, dark-theme overrides, what is deferred (skin switcher, other icons per skin).
- One row in BUILT_DURING_HACKATHON.md: `| 2026-10-28 | 46: rain skins | rain button in engraving, watercolor and ink looks keyed by data-skin through the icon registry, temporary ?skin= param | Muse Code (Contributor) |`.

Do not touch: app/player.tsx (except nothing — leave it), app/reader.tsx, use-pictures, music modules, server/, core/ (except none needed).

Run: npm test, npm run -s typecheck, npm run -s build, npm run -s check:isolation, npm run -s test:hooks, npm run -s check:size, npm run -s check:secrets. (pipeline/ingest.test.ts fails locally on main too due to a jsdom env issue; ignore only that one.) Commit in 2-3 focused commits (the hook adds the trailer). Do not push.
