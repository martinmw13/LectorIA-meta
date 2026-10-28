# Task 31: Skin seam (tokens + icon registry)

Zero visual change. Rendered pixels and computed styles stay identical;
this only lays the seam Martin will later use to switch the whole UI
between skins (ink engraving, watercolor, ink doodle — designs not chosen).

## What changed

- `app/skin.ts`: `SKINS`, `SkinId`, `DEFAULT_SKIN`, `isSkinId`, with a
  small vitest test. Only `"default"` exists.
- `app/layout.tsx`: `<html>` carries `data-skin={DEFAULT_SKIN}`,
  server-rendered and static. Theme still starts light via `THEME_SCRIPT`.
- `app/tokens.css`: same values, two commented layers. The skin layer
  (fonts, sizes, measure, spacing, motion) sits under
  `:root, html[data-skin="default"]`; the colour blocks are untouched.
  `:root` stays in each selector list so specificity is unchanged.
- `app/icons.tsx`: `ICON_SETS` holds the current folio icons verbatim
  under `default`; `Icon` resolves `ICON_SETS[skin][name]` with fallback
  to `default` and renders the same `<svg>` markup the call sites had.
- Migrated inline SVGs in `app/folio/chrome.tsx`, `panels-modal.tsx`,
  `picture-copy.tsx` (`PictureIcon` wraps `<Icon name="picture" />`,
  callers untouched), and `vault.tsx`. The `svg` elements, sizes, paths,
  and attributes are unchanged, so selectors like `.theme-btn svg` match.
- `app/icons.test.ts`: every name resolves for every skin, and no
  `<svg` appears in `app/**/*.tsx` outside `app/icons.tsx` and the
  allowlist (`app/player.tsx`, `app/rain-button.tsx` — they migrate
  after their open PRs land).

## How to add a skin

1. Append the id to `SKINS` in `app/skin.ts`.
2. Add an `html[data-skin="x"]` block (and
   `html[data-skin="x"][data-theme="dark"]` for dark tweaks) in
   `app/tokens.css`, overriding the same token names.
3. Add an icon set entry under `ICON_SETS` in `app/icons.tsx`.

## Deferred

- `player.tsx` and `rain-button.tsx` icons (open PRs own them).
- Tokenizing literal radii/border/shadow values in `app/styles/*.css`:
  done with the chosen skin, not now. No unused role tokens were added.

## Checks

`npm test`, typecheck, build, `check:isolation`, `test:hooks`,
`check:size`, `check:secrets`.
