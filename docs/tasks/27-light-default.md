# Task 27: Light default and one swappable music-style control

## What changed

- The app starts in light mode on every page when `localStorage`
  `lectoria.theme` holds no explicit `light`/`dark`. The inline script in
  `app/layout.tsx` no longer reads `prefers-color-scheme`. `app/theme.ts`
  owns the `initialTheme` helper and the script string; `app/reader.tsx`
  uses the helper. `:root` already carried the light tokens.
- The sticker buttons and Chopin toggle moved unchanged to
  `app/folio/music-style-control.tsx` (`MusicStyleControl` plus an
  exported `MusicStyleControlProps`), with their CSS in
  `app/styles/music-style-control.css`. `app/player.tsx` only changed its
  import and JSX tag. Replacing those two files swaps the design.

## Why

Martin asked for light first, with the toggle and stored choice kept.
The control move is the seam for the upcoming 3-state cycling button,
whose design is still open, so no visual change was made here.

## Checks

`npm test`, typecheck, build, `check:isolation`, `test:hooks`,
`check:size`, `check:secrets`.
