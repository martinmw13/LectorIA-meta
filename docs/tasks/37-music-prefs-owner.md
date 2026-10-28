# Task 37: One owner for persisted music prefs

## Bug

Touching volume or mute before the music manifest loaded (or after the
fetch failed) wiped the saved style and Chopin mode. On reload the
user's style and Chopin mode were gone.

## Cause

`app/reader.tsx` saved `lectoria.music.v1` from three places (`send`,
`changeVolume`, `changeMuted`), each writing the full object.
`changeVolume` and `changeMuted` derived `style` and `playlist` from
`sessionRef.current?.view`, which is null before the manifest loads and
stays null forever if that fetch fails. So an early volume or mute
change wrote `style: null, playlist: false` over the stored values.

## Fix

- `app/music-prefs.ts` adds `createMusicPrefsStore(storage?)`, the one
  owner of the persisted prefs. `load` reads storage once with the same
  validation as `loadMusicPrefs` and caches the full object; `update`
  merges the patch over the last known full prefs (or defaults
  `style: null, volume: 0.8, muted: false, playlist: false` when
  nothing is stored) and writes the merged object. `update` before
  `load` loads first, so stored fields survive. Storage access stays
  guarded; a throwing store still merges in memory. `loadMusicPrefs`,
  `MUSIC_PREFS_KEY`, and `DEFAULT_VOLUME` keep their behaviour;
  `saveMusicPrefs` is gone (the store is the only writer).
- `app/reader.tsx` creates the store once in a ref, loads through it
  in the mount effect, and saves partial updates only:
  `changeVolume` sends `{ volume }`, `changeMuted` sends `{ muted }`,
  `send` sends `{ style, playlist }` from the session.

## Checks

`npm test`, typecheck, build, `check:isolation`, `test:hooks`,
`check:size`, `check:secrets`.
