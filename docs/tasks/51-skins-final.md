# Task 51: final skin ids and one icon fallback rule

Changed: `SKINS` in `app/skin.ts` is now Martin's final six: `engraving`, `watercolor`, `ink`, `pencil` (Study variant, `/workspace/prototypes/skins-lapiz/study.html`), `comic` and `chihiro` (Lantern, `/workspace/prototypes/skins-chihiro/lantern.html`). Only `anime-ghibli` is gone (the old anime skin was never shipped). A stored or `?skin=` value of `anime-ghibli` is no longer valid, so it falls back to `engraving`. `?skin=comic` opens comic.

Image style: `SKIN_DEFAULT_IMAGE_STYLE` in `core/image-style.ts` maps `comic` to the existing `comic` preset. `pencil` and `chihiro` have no mapping yet and resolve to `denslow`.

Fallback rule: `iconSkin(name, skin)` in `app/icons.tsx` is the single rule. It returns the skin when that skin has its own icon, and otherwise the default skin. `<Icon>` resolves through it (then falls back to `BASE_ICONS`), and the rain button computes `data-art` through it, so the per-skin CSS and the SVG cannot disagree. `hasRainArt` in `app/icons-rain.tsx` is removed.

Not yet: pencil, comic and chihiro have no icon art, so they render the engraving rain. Porting their skins (tokens, rain art and the rest) is the next task.

Written directly, not by Muse: a simple refactor and its tests.

Checks: `npm test`, typecheck, build, check:size, check:isolation.
