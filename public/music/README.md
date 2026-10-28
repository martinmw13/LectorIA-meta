# Music files

Two placeholder tracks stand in for the full soundtrack while real
recordings arrive. The reader fetches `manifest.json` from the client
and plays the listed files. No code change is needed to ship real
tracks.

## Drop in real tracks

1. Put the finished audio files under `public/music/`.
2. Edit `manifest.json`: keep version 3 and the shape the
   `parseManifest` function in `core/music.ts` accepts.
3. List each style once in `styles` with a lowercase slug `id` and a
   Spanish display `name`. Keep one style per soundtrack. A style with no
   audible tracks stays out of the style selector.
4. Add a `soundtracks` entry per orchestra or source with its `id`,
   `name`, `style`, and optional `credit`. Set `soundtrack` and `style`
   on each track. A soundtrack with no tracks yet parses.
5. Set `emotion` by hand to the track's dominant mood: one of `calma`,
   `alegria`, `tristeza`, `suspenso`, `misterio`, `aventura`, `combate`,
   `asombro`. The vector, intensity, and tempo should match what the
   track sounds like.
6. Optional: `startSec` skips an intro on first play and on each loop,
   `loop: false` hands the next pick to the scheduler at the end,
   `artist`, `composer`, `license`, `attribution`, and an https
   `sourceUrl` show in the player bar.
7. Keep `src` values as `/music/` paths or `https` URLs. Remote URLs
   need a `media-src` addition in `next.config.ts`.

## Add the Chopin playlist

The player shows a `Just play Chopin` button only when the manifest
defines a playlist with id `just-play-chopin` and a non-empty
`trackIds` list. The button text comes from the playlist `label`, so
keep it exactly `Just play Chopin`. To add it once the recordings
exist:

1. Add the four Ballades (Op. 23, 38, 47, 52) as tracks with
   `playlistOnly: true`. They still need `soundtrack`, `style`, and
   every required field. Set `emotion` by hand as usual; the playlist
   ignores it.
2. Add one `playlists` entry with id `just-play-chopin`, label
   `Just play Chopin`, and `trackIds` listing the four track ids in
   play order. The player loops that order until the user turns the
   button off.

Validate with `npm test`. The manifest test loads the committed file
through `parseManifest` and checks that every local `src` exists.

## License note

MusicGen weights are CC-BY-NC. The clips here are test output from
those weights, so this demo stays non-commercial. The same rule covers
the full soundtrack when it lands.
