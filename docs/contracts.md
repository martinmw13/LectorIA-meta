# Contracts

Music generation must never block the reader. Each module below owns one
job and can be swapped without touching the others. Import direction is
`core <- server` and `core <- app`. Server and client components never
import each other. `app/page.tsx` may import `server/books.ts`. Client
files never do.

## Book data

`data/books/oz/book.json` holds the frozen text: id, title, author,
`textVersion` hash, chapters with `start_n` and `end_n`, and paragraphs
with `id`, `ch`, `n`, and `text`. `analysis.json` is the scene source
the reader consumes: the same scenes plus Jev vectors, the Muse
override, and the `final` emotion. `scenes.json` is the pipeline
intermediate that `analysis.json` mirrors. The reader consumes the book
fields, scene ranges and titles, and the `final` vector with intensity
and tempo. It never sees `jev`, `muse_override`, or provenance.
`core/reader.ts` defines `buildReaderModel`, which joins paragraphs to
scenes by ordinal range and throws on unordered scenes or on paragraphs
covered zero or two times. The `resplit` pipeline step (after
`classify`, before `cluster`) cuts candidate scenes into ~100 to 160
word windows, classifies each window with Jev, and splits at the
strongest persistent dominant-emotion shift (auto at margin 0.30,
Muse decides 0.15 to 0.30, none below). The first part keeps the
scene id with letter-suffixed later parts; provenance lands under
`provenance.resplit` in `analysis.json`.

## Scene reader

One static route per scene (`app/leer/[sceneId]`, `dynamicParams`
false); `/` redirects to the first scene. The layout mounts the music
container once and passes slim metadata for all scenes: id, chapter,
and emotion triple only. Each scene page builds its view with
`buildSceneView` and ships only that scene's text, its chapter title,
and neighbor ids. Sub-pages come from `paginateScene`, which closes a
page when the next paragraph would pass 250 words or the line budget
(`FIRST_PAGE_LINES` 16 on page one, `LINES_PER_PAGE` 17 after, each
paragraph costing `ceil(chars / CHARS_PER_LINE)` lines with
`CHARS_PER_LINE` 68), split at paragraph boundaries. The pager moves sub-pages in client state and
pushes routes with `router.push`, never `<Link>`; going back lands on
the previous scene's last sub-page through a one-shot client flag, never
a URL param, so prerendered pages stay static. The client never
receives other scenes' text, titles, or summaries. The progress line
reads `Chapter 1 · The Cyclone`, a spaced separator, then `Scene 1 of 4
· Page 1 of 3` as two spans on one line. Book type is 1.1875rem / 1.7
with no paragraph gaps and a 1.5em first-line indent on following
paragraphs. The word budget stays the upper bound and the line budget
keeps every sub-page inside 1280×800 without scroll.

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

## Selection

`MusicSelection = { style }` is the session: `style` scopes every pick.
There is one mode only. Every scheduled select ranges over all tracks in
the current style and draws among the tracks with the scene emotion (or
the best same-style tracks when the emotion is missing) within
`randomTolerance` (0.05) of the best score, keeps the current track when
it is eligible, and avoids an immediate repeat otherwise. The style is
the user's choice, changed with the style selector. The default style is
the first listed style with tracks; a stored style with tracks wins. The
session persists `{ style, volume, muted }` in localStorage under
`lectoria.music.v1`. Old values with `mode` or `soundtrackId` load by
`style` alone and ignore unknown fields; a stored object without
`volume` or `muted` loads `volume: null` and `muted: false`. A bad
`volume` (not a finite number in 0..1) loads null and the player starts
at 0.8; a bad `muted` loads false. A stored style with no tracks falls
back to the default. Storage exceptions never break playback. Dwell
and min-track rules hold. The core never calls `Math.random`; the
reader injects it and tests pass a seeded stub.

## Next track and style change

`nextTrack` cycles same-emotion tracks in score order across the whole
style, wrapping and skipping the current, then the best same-style track
overall when the emotion is missing. A null scene cycles the style set
in id order. One track or none gives null.

`requestStyleChange` picks the best match for the scene in the new style
by score. It never crosses styles. The scheduler applies it at once
with the normal crossfade and holds the choice like a Next. There is no
mix toggle and no soundtrack-change button.

## Playlist mode

`SchedulerState.playlist` holds `{ id, index }` while a fixed playlist
plays. `enterPlaylist` switches at once to the first `trackIds` entry
with `crossfadeSec`, no dwell and no min-track rule. While it is on,
scene changes update the active scene but never switch, `requestNext`
and `noteTrackEnded` advance to the next entry in order and wrap from
the last to the first, and playlist tracks run to their end because the
player forces looping off. `exitPlaylist` clears the playlist state and
switches at once to the best match for the current scene under the
restored selection. The playlist is never persisted, so a reload returns
to emotion mode. The style selector stays disabled while it is on, and
the style list hides styles with only playlist tracks.

## Similarity and config

`Similarity = (scene, track, weights) => number`, where
`SceneSignal = { vector, intensity, tempo }`. The default is
`bhattacharyyaSimilarity`: both 8-emotion vectors renormalize to sum 1
(an all-zero vector gives an affinity of 0), `E` is the sum of
`sqrt(s_k * t_k)`, and the score is `weights.emotion * E` plus
`weights.intensity` and `weights.tempo` each for intensity and tempo
closeness. Scoring and ranking pass the resolved config weights in, so
a weights override changes the ranking. `cosineSimilarity` over
`buildFeatures` output stays as an exported alternative. One exported object,
`MUSIC_CONFIG`, holds `similarity`, `weights`, `dwellSec` (20),
`sceneEntryDwellSec` (5), `minTrackSec` (45), `crossfadeSec` (3), and
`randomTolerance` (0.05). Everything else reads from it. Ranking ties go
to the lower track id. Route entries use `sceneEntryDwellSec` as the
dwell override; scoring and overrides are unchanged.

## Selection scheduler

`core/music-schedule.ts` is a pure state machine. The reader calls
`observeScene`, `tickScheduler`, `requestNext`, and `noteTrackEnded`
with explicit `nowSec` values, so all timing is testable without
timers. The reader cues music on scene entry only: one `observeScene`
call per route id, gated by an id comparison, so sub-page moves never
reach the scheduler. State holds the current track id and when it started, the active
scene id, the pending scene id and since when, and the skip override
with the scene it belongs to.

A newly entered scene becomes pending and the dwell clock restarts, so
fast scrolling keeps only the newest scene. The first track ever plays
at once with no dwell. After the pending scene holds for `dwellSec` it
becomes active and the override clears. Then a scheduled select draws
among the in-style tracks within `randomTolerance` of the best score,
keeping the current track when it is eligible, and switches to the
drawn track only once the current track played `minTrackSec`. A tick
passes the active scene back through the same draw, so a hold from
`minTrackSec` releases on time, unless a skip override stands: ticks
return no change while it is set, and only a new scene promotion
clears it. A switch reports the normal crossfade length (3 s, 0 s for
the first track ever). The skip choice holds until the next scene change;
after that, dwell and the draw apply with the override track as the
current track. A null scene means a failed analysis with no vector, so
it never triggers a switch. A non-looping track that ends fades into
the best remaining track, excluding the one that ended, and clears the
skip override.

## Player

`app/player.tsx` takes the track, `replayNonce`, the fade length for
the latest switch, `canPrev`/`canSkip` with their handlers, volume and
mute with their handlers, the style list with the current style and its
handler, the end-of-track handler, and the playlist props
(`playlistOn`, `playlistLabel`, `onTogglePlaylist`,
`controlsDisabled`). It owns two `audio`
elements, play state, volume, and the equal-power crossfade
(cos/sin gains over the fade time, driven by `requestAnimationFrame`).
It never uses the `loop` attribute. Volume lives in a ref, so the slider
never re-runs the track effect or touches `src`. A new track request
mid-fade cancels the pending fade and fades from the audible element to
the newest track. On load each track seeks to `startSec` once metadata
is available. Long tracks with `loop` true crossfade into the other
element playing the same track from `startSec` when `currentTime`
reaches `duration - fade`, where `fade` is the latest scheduler fade
length, or the config `crossfadeSec` when none was reported yet. When
`loop` is false the player reports the end and the scheduler picks the
next-best track excluding the ended one. Pause stops both elements and
freezes the fade in place; play resumes the audible elements from the
frozen point. Audio starts once, on the first press, with fade 0.
Audio starts only after the user presses play. Reduced motion is read in
state with a change listener and affects visuals only, never the fade.

The bar is one sticky row, 56 px tall: the `Lectoria` wordmark left,
the player centre, the Chopin button and the source icon link right.
The inner row is centered with 24 px side padding, one bottom hairline
in the border token, and nothing touching the viewport edges. The inner
max-width is 56rem, wider than the 65ch book column on purpose so the
full now-playing line fits at 1280 px. The player holds Previous,
Play/Pause, Next, the now-playing line (flexible space, `min-width`
16rem, truncated with an ellipsis, full line in the `title` tooltip),
a mute icon button (`aria-pressed`, `aria-label` `Mute` / `Unmute`, the
icon shows the muted state), a volume slider with `aria-label` `Volume`
(96 px) next to it, a style selector with `aria-label`
`Orchestra / Piano` and no visible label text listing only styles that
have tracks (hidden while fewer than two qualify), then the Chopin
button and the source icon link. The transport and mute buttons and the
source icon link are icon-only inline SVGs (`currentColor`, 32 px hit
area), quiet and neutral, Meta blue on hover and focus-visible, each
with `aria-label` and `title`; the source link reads `Music source
(opens in new tab)`. Previous walks the session history and restarts
the current track with no history, including the current playlist piece
in playlist mode; Next cycles same-emotion tracks in the style.
A `Just play Chopin` round image button (`/art/chopin-just-play-me.png`,
40 px, `alt` and `aria-label` `Just play Chopin`) appears only when
the manifest defines that playlist with tracks; it carries
`aria-pressed`, and while pressed it shows a 2 px Meta-blue ring plus
scale 1.05. The now-playing line shows `display title · composer
· source`: `displayTitle` drops quoted nicknames, key phrases, and
opus/catalogue suffixes from the track title, and the source is the
artist plus ` / <platform>` when the attribution names Musopen or
Jamendo and the artist does not already say it, dropped when it would
repeat the performer. The full manifest title plus the license and full
attribution sits in the `title` tooltip. On manifest failure the reader
still renders and the bar shows a short neutral note. UI motion stays
under 200 ms. Controls are real buttons and inputs with labels, visible
focus, and keyboard use. `app/player.tsx` keeps the audio engine,
transport, and bar layout; `app/player-controls.tsx` holds the style
selector and the playlist toggle; `app/music-prefs.ts` owns the storage
helper. The heading keeps `h2:focus:not(:focus-visible){outline:none}`
so mouse navigation shows no box while keyboard focus keeps its ring.
No user-visible emotion labels exist; ids stay as they are.
`core/music-credit.ts` builds the line as a pure function with tests,
including the pure `displayTitle`.
`core/music-history.ts` is the bounded history stack and
`requestManualTrack` in `core/music-schedule.ts` holds a manual pick.

## Image api

`POST /api/images` (Node runtime, `maxDuration` 120). Request is a
discriminated union: `{ kind: "passage", bookId, textVersion, n }` names
the paragraph where the selection starts, `{ kind: "scene", bookId,
textVersion, sceneId }` names the scene. Validation is strict: known
book, matching `textVersion`, integer `n` inside the book, known
`sceneId`. Any other body is a 400 with a generic English message.
The client sends ordinals and ids only, never text. "Illustrate
scene" uses the scene id from the route.

Responses (typed in `core/types.ts`): `{ status: "ready", url, cached,
caption }` with a Vercel Blob URL, never bytes; `{ status: "pending" }`
when another request holds the lock, in which case the client reposts
every 3 s up to about 2 minutes; `{ status: "error", code, message }`
where code is `quota`, `budget`, `unavailable`, or `bad_request` with a
friendly English message. Caption is the scene title for scenes and the
first words of the paragraph for passages, built server-side.

The passage cache key is book plus start paragraph plus `textVersion`
plus `PROMPT_VERSION` (`v1`); the scene key is book plus scene id plus
the same versions. Both map to a deterministic Blob path
(`addRandomSuffix: false`, `allowOverwrite: false`). An Upstash Redis
index maps key to Blob URL, so hits are one GET; on an index miss the
server lists by exact path prefix (head equivalent) before generating
and backfills the index.
A Redis lock per key returns `pending` to concurrent requests. Quota is
5 new images per person per day by hashed IP and signed cookie,
whichever runs out first; a shared spend counter in integer
micro-dollars sits under `SPEND_CAP_USD` (default 10). Failures refund
quota and budget and release the lock.

## Chat api

Contract only, no routes. Request `{ bookId, textVersion, positionN,
spoilerMode, messages }` carries the chat history and the reader
position. The response is streamed text. The server builds context from
the book text up to `positionN`, or the whole book when `spoilerMode` is
on, with the book prefix first and the question last so readers share
the prompt cache. The system prompt answers only from that text and
refuses the rest. Types live in `core/types.ts`.

## Quotas and budget

Server only. Spend is counted in integer micro-dollars: reserve with
Redis `INCRBY` before each model call, refund with `DECRBY` after, one
reserve per call including retries. The server clamps every model tool
argument. Clients never see keys or raw errors. Generic messages go to
the client, details stay in server logs.
