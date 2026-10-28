# Music files

The reader fetches `manifest.json` from the client and plays the listed
files. Real recordings live in the `lectoria-images` Blob store under
`music/v1/<soundtrack>/`, never in this repo. No code change is needed
to ship new tracks.

## Add or relabel tracks

1. Upload the finished file to the store under `music/v1/<soundtrack>/`.
   Upload ND-licensed tracks unedited. Normalize the rest to about
   -20 LUFS first, then match loudness at playback with `gainDb`.
2. Add one `entries` row in `data/music/library.json` with the Blob `src`,
   the manifest `soundtrack`, the file `durationSec`, and the credit
   fields (`title`, `composer`, `artist`, `license`, `attribution`,
   `sourceUrl`, `source`). Set `gainDb` when the file needs a trim and
   `noDerivatives: true` for ND tracks, which always play whole.
3. Export the etiquetar labels to `data/music/labels.json`.
4. Regenerate the manifest:

   `npm run build:music data/music/labels.json data/music/library.json --out public/music/manifest.json`

   The converter makes one track per labeled segment. It skips discarded
   tracks, tracks with no library entry, and rows whose soundtrack style
   differs from the export style. It stores `startSec` only when above 0
   and `endSec` only when more than 0.5 s before the file end, and it runs
   the result through `parseManifest` before writing.

## Track fields

Each track carries the segment `emotion` and vector plus `intensity` and
`tempo`. `durationSec` is the playable length. `startSec` defaults to 0
and `endSec` to the media end. `gainDb` trims loud ones down and quiet
ones up within -24..12 dB. `loop: true` crossfades at `endSec`; `loop:
false` hands the next pick to the scheduler. `src` values stay as
`https` Blob URLs. The store host is the only entry in `media-src` in
`next.config.ts`.

Validate with `npm test`. The manifest test loads the committed file
through `parseManifest`. Local `src` values must exist under `public/`;
`https` values are never fetched.

## The Chopin playlist

The player shows a `Just play Chopin` button only when the manifest
defines a playlist with id `just-play-chopin` and a non-empty
`trackIds` list. The button text comes from the playlist `label`, so
keep it exactly `Just play Chopin`.

The playlist and its tracks come from the library file: `playlists`
passes through, and `extraTracks` appends verbatim after the converted
tracks. The Chopin tracks use `playlistOnly: true`. They still need
`soundtrack`, `style`, and every required field. The playlist ignores
their emotion. The player loops that order until the user turns the
button off.

## License note

The first placeholder tracks were MusicGen output, and those weights are
CC-BY-NC, so the demo stayed non-commercial. Real recordings carry their
own `license` and `attribution` from the library file.
