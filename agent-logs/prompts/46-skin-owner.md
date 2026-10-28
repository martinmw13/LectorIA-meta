# Task 46 (part 2): one runtime owner for the current skin

Same worktree /workspace/wt-seam, branch `rain-skins` (your rain port commits are on it). Follow AGENTS.md. Never run `next start`/`next dev`. Do not push. Keep it small.

Architecture review: data-skin is hardcoded in layout and nothing reads, stores or applies it except an ad-hoc read in rain-button.tsx. Make app/skin.ts the single runtime owner of the current skin, mirroring app/theme.ts (THEME_KEY, initialTheme, THEME_SCRIPT) and how reader.tsx applies theme.

## app/skin.ts
- Final skins: `SKINS = ["engraving", "watercolor", "ink", "comic", "anime-ghibli"] as const`, `DEFAULT_SKIN = "engraving"`. `isSkinId` stays.
- `SKIN_KEY = "lectoria.skin"` (localStorage).
- `initialSkin(stored: unknown, search?: string): SkinId` pure: a valid `?skin=` in `search` wins, else a valid stored value, else DEFAULT_SKIN.
- `SKIN_SCRIPT`: pre-first-paint inline script (rendered in layout.tsx next to THEME_SCRIPT, replacing the current temporary one) that applies the same rule to `document.documentElement` `data-skin`; try/catch falls back to the default. The `?skin=` override applies to that load only and is NOT written to storage. Keep the server-rendered `data-skin={DEFAULT_SKIN}` on <html> with suppressHydrationWarning (already there).
- Runtime API (client-safe, no React import needed for the core):
  - `getSkin(): SkinId` reads the live `data-skin` on documentElement (DEFAULT_SKIN on the server / when invalid).
  - `setSkin(s: SkinId)`: sets data-skin, persists to SKIN_KEY (try/catch), notifies subscribers. This is what a future home cycling button / skin switcher calls.
  - `subscribe(cb): () => void` (listeners set; also react to the `storage` event for SKIN_KEY across tabs).
  - `cycleSkin()` helper returning the next skin in SKINS order and applying it (for the home cycling button).
  - `useSkin(): SkinId` hook via `useSyncExternalStore(subscribe, getSkin, () => DEFAULT_SKIN)`; put it in `app/use-skin.ts` ("use client") if keeping skin.ts React-free is cleaner.
- Header comment: every skin-dependent surface (icons, read-along highlight, Picture this animations, image style, button animations) reads from here: getSkin/subscribe or useSkin, or CSS keyed on `html[data-skin]`. Nothing else may write data-skin.

## Consumers
- app/rain-button.tsx: replace its ad-hoc useState/useEffect read with `useSkin()`. Do not touch any audio/prefs logic.
- Rain art exists only for engraving, watercolor and ink. For comic and anime-ghibli the rain button must render the default (engraving) art and motion: resolve `artSkin = hasRainArt(skin) ? skin : DEFAULT_SKIN` once (exported helper next to the rain icons), pass it to `<Icon skin={artSkin}>`, and make the rain CSS key on that resolved value (e.g. a `data-art` attribute on the button) instead of raw `html[data-skin]`, keeping the dark-theme overrides (`html[data-theme="dark"] … [data-art="x"]`). Icon registry fallback chain: `ICON_SETS[skin]?.[name] ?? ICON_SETS[DEFAULT_SKIN]?.[name] ?? BASE_ICONS[name]`.
- No other consumer wiring now (read-along, Picture this, image style come with their skin work); just make sure the API is there. Do NOT touch reader.tsx, player.tsx, image-style.ts or use-pictures.
- tokens.css skin layer keeps applying to every skin with identical values.

## Tests
- skin.test.ts: initialSkin precedence (param > stored > default, invalid ignored), SKIN_SCRIPT with fake document/localStorage/location (param applied and not stored; stored applied; garbage -> default), setSkin persists + notifies, subscribe unsubscribe works, cycleSkin wraps around, getSkin invalid -> default. Mirror theme.test.ts style (no DOM env).
- icons.test.ts: every skin resolves every rain name (comic/anime-ghibli fall back to engraving); hasRainArt true only for the three.
- Update docs/tasks/46-rain-skins.md with a "Skin owner" section; update the BUILT_DURING_HACKATHON row text to mention the skin owner (keep one row).

Run npm test, typecheck, build, check:isolation, test:hooks, check:size, check:secrets (pipeline/ingest.test.ts fails locally on main too; ignore only that). Commit as 1-2 focused commits. Do not push.
