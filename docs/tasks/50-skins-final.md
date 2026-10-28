# Task 50: final skin ids and one icon fallback rule

Changed: `SKINS` in `app/skin.ts` is now the final five: `engraving`, `watercolor`, `ink`, `pencil` (Study variant, `/workspace/prototypes/skins-lapiz/study.html`) and `chihiro` (Lantern, `/workspace/prototypes/skins-chihiro/lantern.html`). `comic` and `anime-ghibli` are gone. A stored value of either is no longer valid, so it falls back to `engraving`.

Fallback rule: `iconSkin(name, skin)` in `app/icons.tsx` is the single rule. It returns the skin when that skin has its own icon, and otherwise the default skin. `<Icon>` resolves through it (then falls back to `BASE_ICONS`), and the rain button computes `data-art` through it, so the per-skin CSS and the SVG cannot disagree. `hasRainArt` in `app/icons-rain.tsx` is removed.

Not yet: pencil and chihiro have no icon art, so they render the engraving rain. Porting their skins (tokens, rain art and the rest) is the next task.

Written directly, not by Muse: a simple refactor and its tests.

Checks: `npm test`, typecheck, build, check:size, check:isolation.
