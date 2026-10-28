# Music files

The reader fetches `manifest.json` from the client and plays the listed
files. Real recordings live in the `lectoria-images` Blob store under
`music/v1/<soundtrack>/`, never in this repo. No code change is needed
to ship new tracks.

## Add or relabel tracks

1. Upload the finished file to the store under `music/v1/<soundtrack>/`.
   Upload ND-licensed tracks unedited. Every track should play at about
   -20 LUFS integrated: either normalize the file, or upload it as is and
   set `gainDb` to `-20 - measured LUFS`. Gain above about +1 dB clips
   at full volume, so a quiet ND track that needs more is left out.
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

## Current library (provisional)

Every track in `manifest.json` has `provisional: true`: its labels are
the etiquetar.html suggestions, not yet reviewed. `data/music/labels.json`
holds those drafts as a schemaVersion 2 export. Replace it with the
reviewed export and rerun the converter.

- Orchestra: Musopen / Czech National Symphony Orchestra (normalized to
  -20 LUFS, 144 kbps), Holst's Mars and Jupiter by the Skidmore College
  Orchestra, and 16 Jamendo tracks (as downloaded, `gainDb` trims).
- Piano: Jamendo piano tracks that tag as solo piano (as downloaded,
  `gainDb` trims).
- Just play Chopin: 22 solo piano recordings from Musopen "Set Chopin
  Free" (public domain, CC0), 160 kbps. See below.

Left out: the 1923 Columbia acoustic Holst recordings, the USAF Heritage
Band wind transcriptions, and the MuseScore render, because they sound
out of place next to the orchestras when soundtracks mix.

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

### Chopin credits

All Chopin files come from the Musopen "Set Chopin Free" Kickstarter
recordings (2012), released CC0. The four Ballades
(`music/v1/chopin-levy/`) came from Wikimedia Commons. The other 18
(`music/v1/chopin-musopen/`) came from the FLAC set on the Internet
Archive, item `musopen-chopin-complete-works-flac`
(https://archive.org/details/musopen-chopin-complete-works-flac, CC0
1.0). Each `sourceUrl` in the library points at the exact file. Where
Wikimedia Commons hosts the same recording, its file page also lists it
as public domain.

Processing for the 18: measure EBU R128 integrated loudness of the FLAC,
apply a fixed gain to -20 LUFS (no compression), a peak limiter at
-1 dBFS that only touches stray peaks, then LAME MP3 160 kbps CBR,
44.1 kHz stereo, metadata stripped (ffmpeg 7.1). Results measure -20.4
to -20.6 LUFS with true peak at or under -1.3 dBTP, so no `gainDb` is
needed. The Ballades measure about -20.7 LUFS.

| # | Work | Pianist |
| --- | --- | --- |
| 1 | Nocturne in E-flat major, Op. 9 No. 2 | Frank Lévy |
| 2 | Waltz in C-sharp minor, Op. 64 No. 2 | Olga Gurevich |
| 3 | Prelude in E minor, Op. 28 No. 4 | Jeannette Fang |
| 4 | Grande Valse Brillante, Op. 18 | Olga Gurevich |
| 5 | Ballade No. 1, Op. 23 | Frank Lévy |
| 6 | Prelude Op. 28 No. 15 "Raindrop" | Jeannette Fang |
| 7 | Fantaisie-Impromptu, Op. 66 | Frank Lévy |
| 8 | Berceuse, Op. 57 | Olga Gurevich |
| 9 | Étude Op. 10 No. 3 "Tristesse" | Edward Neeman |
| 10 | Waltz Op. 64 No. 1 "Minute" | Olga Gurevich |
| 11 | Ballade No. 2, Op. 38 | Frank Lévy |
| 12 | Nocturne in D-flat major, Op. 27 No. 2 | Frank Lévy |
| 13 | Étude Op. 10 No. 12 "Revolutionary" | Edward Neeman |
| 14 | Nocturne in C-sharp minor, B. 49 (Op. posth.) | Frank Lévy |
| 15 | Polonaise Op. 40 No. 1 "Military" | Aya Higuchi |
| 16 | Barcarolle, Op. 60 | Olga Gurevich |
| 17 | Ballade No. 3, Op. 47 | Frank Lévy |
| 18 | Étude Op. 25 No. 11 "Winter Wind" | Edward Neeman |
| 19 | Scherzo No. 2, Op. 31 | Alice G. Young |
| 20 | Sonata No. 2, Op. 35: III. Marche funèbre | Paul Pitman |
| 21 | Ballade No. 4, Op. 52 | Frank Lévy |
| 22 | Polonaise Op. 53 "Heroic" | Luke Faulkner |

The order alternates quiet and bright pieces and spaces out the
Ballades, ending on the Heroic Polonaise before the loop restarts.

## Rain ambience

The rain button next to the music volume cycles one CC0 loop per level
(off, drizzle, moderate, storm). Levels and fades are in
[docs/tasks/25-rain-ambience.md](../../docs/tasks/25-rain-ambience.md);
file credits are in [../ambience/SOURCES.md](../ambience/SOURCES.md).

## License note

The first placeholder tracks were MusicGen output, and those weights are
CC-BY-NC, so the demo stayed non-commercial. Real recordings carry their
own `license` and `attribution` from the library file.
