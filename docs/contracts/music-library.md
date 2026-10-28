## Music library

The library is a static `public/music/manifest.json`, version 3, fetched
by the client from `/music/manifest.json`. A static file needs no route,
ships from the CDN, and swaps by replacing files only. Tracks may be
several minutes long and are not loops unless marked so. A version 2
manifest migrates inline to one implicit `default` soundtrack of style
`orchestral`.

`MusicManifest = { version, styles, soundtracks, tracks, playlists }`.
`StyleInfo = { id, name }` where `id` is a lowercase slug and `name` is
the display name. `Soundtrack = { id, name, style }` plus
optional `credit`. `Track = { id, src, title, emotion, vector,
intensity, tempo, durationSec, soundtrack, style }` plus optional
`startSec` (default 0, where playback starts on first play and on each
loop), `endSec` (default the media end, where the track stops or loops),
`gainDb` (default 0, a loudness trim in dB, in -24..12),
`loop` (default true), `source` (`generated`, `jamendo`, or
`recording`), `artist`, `composer`, `license`, `attribution`, and
`sourceUrl` (https only). `durationSec` is the playable length: the
segment end (or the file end) minus `startSec`. `startSec` and `endSec`
are absolute media times with `startSec < endSec`; `endSec` stays within
`startSec + durationSec`. The player scales volume by the track gain and
ends or loops at `effectiveEnd`, the earlier of `endSec` and the loaded
media end. `emotion` is the hand label: one of the 8
emotion ids in `core/types.ts`. The vector covers the 8 ids with finite
entries in 0..1. Every track names a soundtrack id, every track style
matches its soundtrack style, and every style is a listed style id.
`core/music.ts` owns `parseManifest`, which rejects unknown versions,
duplicate ids, unknown soundtrack or style ids, style mismatches,
missing fields, bad vectors, NaN entries, out-of-range numbers,
a negative `startSec`, a bad `gainDb` or `endSec`, unknown `source`
values, a non-boolean
`playlistOnly`, and any `src`
that is not a `/music/` path or `https` URL. Unknown fields stay
ignored. A soundtrack with no
tracks parses. The reader calls it on every fetch, so a bad drop-in
fails loudly in dev. Remote audio lives on one Blob store, so
`media-src` in `next.config.ts` lists exactly
`https://3vuhzq2wmortnuxj.public.blob.vercel-storage.com`. Build the
manifest with `npm run build:music data/music/labels.json
data/music/library.json --out public/music/manifest.json`, which runs
`pipeline/labels-to-manifest.ts` and validates the result before
writing.

`Track.playlistOnly` defaults to false. A true value marks a playlist
only track: it still names a soundtrack and style, but no emotion pick
ever returns it. `MusicManifest.playlists` holds
`Playlist = { id, label, trackIds }` entries, most notably
`just-play-chopin`. A missing key parses as an empty list, and a v2
migration gives an empty list. Parse rejects duplicate playlist ids,
empty labels, non-array `trackIds`, and any `trackIds` entry that names
no track, with the playlist and the id in the message.

