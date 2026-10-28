# Task 46: rain button in three skins

Ported the approved rain-button v2 prototypes into the production rain button, one look per skin, resolved through the icon registry by `data-skin`.

Looks: `engraving` (burin-etched cloud with cross-hatching, ring of engraved rays, coin-turn entrance, shimmer on hover), `watercolor` (soft washes on paper with pigment halo, bloom entrance, bleed on hover), `ink` (blue ballpoint doodle with pen-stroke burst halo, stamp entrance, wiggle on hover). All share the same cloud, drop and bolt geometry at viewBox 0 0 100 100, rendered at 30px inside the unchanged 34px hit area with `overflow: visible`.

Changed: `app/skin.ts` ships `SKINS = ["engraving", "watercolor", "ink", "comic", "anime-ghibli"] (renamed in task 51 to pencil and chihiro)` with `DEFAULT_SKIN = "engraving"`; `app/icons-rain.tsx` holds the twelve rain defs (JSX, no dangerouslySetInnerHTML, def ids prefixed `rb-`); `app/icons.tsx` falls back to `BASE_ICONS` for non-rain names; `app/rain-button.tsx` renders `<Icon name={`rain-${level}`} skin={skin}/>` in a `.face` span, reading the skin from `document.documentElement.dataset.skin` on mount; `app/styles/ambience.css` scopes motion tokens (`--rain-m-state`, `--rain-m-draw`, `--rain-ease`) and ink colours per skin and gates every animation on `[data-anim]` (click) or `@media (hover: hover)` (hover), so first paint is still.

Temporary preview: `?skin=watercolor|ink|engraving` sets `data-skin` before paint via `SKIN_SCRIPT` (next to `THEME_SCRIPT` in `app/layout.tsx`). Invalid values are ignored, nothing persists. Remove it when the skin switcher lands.

Dark theme: `html[data-skin="x"][data-theme="dark"]` overrides lighten the inks only (engraving ink `#2A241C` to `#E9DFC6`, ink blue up a bit, watercolor line up); halo, bolt and wash colours stay the same in both themes.

Deferred: the skin switcher itself, per-skin defs for the other icons (they render from `BASE_ICONS` byte-identical everywhere), per-chapter music art.

## Skin owner

`app/skin.ts` is the single runtime owner of the current skin, mirroring `app/theme.ts`. `SKINS` holds the final five (`engraving`, `watercolor`, `ink`, `comic`, `anime-ghibli`) with `engraving` default; `SKIN_KEY = "lectoria.skin"` persists the choice. `initialSkin(stored, search)` is pure: a valid `?skin=` wins, else a valid stored value, else the default. `SKIN_SCRIPT` applies the same rule before first paint (`?skin=` for that load only, never stored). Runtime API: `getSkin` reads the live `data-skin`, `setSkin` writes it plus storage and notifies, `subscribe` also tracks the `storage` event across tabs, `cycleSkin` advances one step for the home button, and `useSkin()` (in `app/use-skin.ts`) subscribes via `useSyncExternalStore`. Nothing else may write `data-skin`.

Rain art still exists only for engraving, watercolor and ink: the button resolves `artSkin = hasRainArt(skin) ? skin : DEFAULT_SKIN` (helper in `app/icons-rain.tsx`), renders `<Icon skin={artSkin}>`, and carries `data-art` so the rain CSS keys on the resolved art instead of raw `html[data-skin]` (dark overrides stay as `html[data-theme="dark"] … [data-art="x"]`). The icon fallback chain is `ICON_SETS[skin] ?? ICON_SETS[DEFAULT_SKIN] ?? BASE_ICONS`. `tokens.css` is unchanged: its `html[data-skin]` layer applies identical values to every skin.

Checks: `npm test` (pipeline/ingest.test.ts fails on main too, jsdom env), `npm run typecheck`, `npm run build`, `npm run check:isolation`, `npm run test:hooks`, `npm run check:size`, `npm run check:secrets`.
