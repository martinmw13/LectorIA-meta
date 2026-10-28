# Task 31: skin seam (tokens + icon registry), zero visual change

Repo LectorIA-meta, worktree /workspace/wt-seam, branch `skin-seam` (from main). Follow AGENTS.md and repo rules. Never run `next start`. Do not push.

Context: Martin will later switch the whole UI between skins (ink engraving, watercolor, ink doodle). The designs are NOT chosen. This task only lays the seam. Pure refactor: rendered pixels and computed styles must stay identical. Do NOT restyle anything, do NOT add any skin besides "default".

Files other open PRs are editing — DO NOT TOUCH: app/player.tsx, app/reader.tsx, app/use-pictures.ts (and app/folio/use-pictures.ts), app/rain-button.tsx, app/music-prefs.ts, anything under server/ or core/music*. Also leave app/styles/*.css bodies alone (no mass tokenization).

## 1. Skin attribute + token layer
- New `app/skin.ts`: `export const SKINS = ["default"] as const; export type SkinId = (typeof SKINS)[number]; export const DEFAULT_SKIN: SkinId = "default";` plus `isSkinId(v: unknown): v is SkinId`. Small vitest test.
- app/layout.tsx: add `data-skin={DEFAULT_SKIN}` on `<html>` (server-rendered, static). Theme stays light by default via the existing THEME_SCRIPT; don't change it.
- app/tokens.css: keep every value byte-identical. Split into two clearly commented layers:
  - Skin layer (fonts, font sizes, line height, measure, spacing, motion, plus new role tokens for radii/borders/shadows only if you also use them nowhere yet — prefer not adding unused ones) under `:root, html[data-skin="default"]`.
  - Theme colour layer: the existing `:root, html[data-theme="light"]` and `html[data-theme="dark"]` blocks unchanged.
  - A header comment explaining: a future skin adds `html[data-skin="x"]` (and `html[data-skin="x"][data-theme="dark"]`) blocks overriding the same names; components only read tokens.
  Selector specificity must not change any computed value (`:root` alone stays in the list).

## 2. Icon registry seam
- New `app/icons.tsx` ("use client" only if needed): `ICON_SETS: Record<SkinId, Partial<Record<IconName, IconDef>>>` with `default` holding the current icons verbatim (same viewBox, paths, attributes, stroke/fill props). `IconName` is a string-literal union. `export function Icon({ name, size, skin = DEFAULT_SKIN, ...aria })` resolves `ICON_SETS[skin][name] ?? ICON_SETS.default[name]` and renders the exact same `<svg>` markup (same width/height/viewBox/aria-hidden/className/attributes) the call site had.
- Migrate the inline SVGs in these files only: app/folio/chrome.tsx, app/folio/panels-modal.tsx, app/folio/picture-copy.tsx (`PictureIcon` becomes a thin wrapper over `<Icon name="picture" />` so callers stay untouched), app/folio/vault.tsx. The DOM produced must be identical (check CSS selectors like `.theme-btn svg` still match: keep the svg element and its attributes/classes).
- Do NOT migrate app/player.tsx or app/rain-button.tsx (open PRs). Guard test `app/icons.test.ts`: no `<svg` in app/**/*.tsx except app/icons.tsx and an explicit allowlist `["app/player.tsx","app/rain-button.tsx"]` with a comment that they migrate after their PRs land. Build the probe string from parts so the test file doesn't match itself. Also a test that every name resolves for every skin.

## 3. Docs
- docs/tasks/31-skin-seam.md: what the seam is, how to add a skin (tokens block + icon set entry + SKINS entry), what's deferred (player/rain icons, tokenizing literal values in app/styles/*.css for radii/borders/shadows — to be done with the chosen skin, not now).
- One row in BUILT_DURING_HACKATHON.md: `| 2026-10-28 | 31: skin seam | data-skin attribute with a default token layer and a named icon registry, zero visual change | Muse Code (Contributor) |`.

Run: npm test, npm run -s typecheck, npm run -s build, check:isolation, test:hooks, check:size, check:secrets. Commit in 1-2 focused commits (hook adds trailer). Do not push.
