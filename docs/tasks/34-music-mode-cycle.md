# Task 34: One music-mode cycle behind the style control

## What changed

- `core/music-modes.ts` owns the ordered mode list: styles with tracks
  in manifest order, then the Chopin mode when the manifest defines it.
  `currentMode` reads the session view, `nextMode` steps with wrap.
  `findChopinPlaylist` moved here from `core/music-session.ts`, which
  re-exports it, and the barrel re-exports the module.
- `core/music-session.ts` adds the `modeAdvanced` intent (`to` or next
  in cycle). Style to style works like `styleChanged`, style to Chopin
  like entering the playlist, and Chopin to a style exits under the
  target selection in one switch with one crossfade. `playlistToggled`
  and `styleChanged` still work. A stored `playlist: true` starts the
  session in Chopin mode, else the stored style stands.
- `PersistedMusicPrefs` gains `playlist: boolean`. `app/music-prefs.ts`
  reads it (missing or bad loads false) and every save site in
  `app/reader.tsx` writes it from the session view.
- `MusicStyleControlProps` is now `{ modes, current, onAdvance }`.
  `app/reader.tsx` builds `modes` and `current` and sends
  `modeAdvanced`; `app/player.tsx` forwards the three props and keeps
  `playlistOn` only for the audio loop-off rule. The stickers and the
  Chopin button look and read the same.

## Why

The 7-prop control forced every future design to know the
style-vs-playlist split. The seam now carries one ordered list, one
selection, and one callback, so the planned 3-state button plugs in
without touching the reader, player, or session.

## The one behavior change

Style stickers stay enabled during Chopin: pressing one leaves the
playlist straight for that style with one crossfade, instead of doing
nothing. Pressing Chopin while on Chopin still returns to the last
picked style.

## Checks

`npm test`, typecheck, build, `check:isolation`, `test:hooks`,
`check:size`, `check:secrets`.
