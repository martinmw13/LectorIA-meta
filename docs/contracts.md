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
covered zero or two times.

## Music library

The library is a static `public/music/manifest.json`, version 3, fetched
by the client from `/music/manifest.json`. A static file needs no route,
ships from the CDN, and swaps by replacing files only. Tracks may be
several minutes long and are not loops unless marked so. A version 2
manifest migrates inline to one implicit `default` soundtrack of style
`orchestral`.

`MusicManifest = { version, styles, soundtracks, tracks, playlists }`.
`StyleInfo = { id, name }` where `id` is a lowercase slug and `name` is
the Spanish display name. `Soundtrack = { id, name, style }` plus
optional `credit`. `Track = { id, src, title, emotion, vector,
intensity, tempo, durationSec, soundtrack, style }` plus optional
`startSec` (default 0, where playback starts on first play and on each
loop), `loop` (default true), `source` (`generated`, `jamendo`, or
`recording`), `artist`, `composer`, `license`, `attribution`, and
`sourceUrl` (https only). `emotion` is the hand label: one of the 8
emotion ids in `core/types.ts`. The vector covers the 8 ids with finite
entries in 0..1. Every track names a soundtrack id, every track style
matches its soundtrack style, and every style is a listed style id.
`core/music.ts` owns `parseManifest`, which rejects unknown versions,
duplicate ids, unknown soundtrack or style ids, style mismatches,
missing fields, bad vectors, NaN entries, out-of-range numbers,
`startSec` outside its range, unknown `source` values, a non-boolean
`playlistOnly`, and any `src`
that is not a `/music/` path or `https` URL. A soundtrack with no
tracks parses. The reader calls it on every fetch, so a bad drop-in
fails loudly in dev. Remote URLs need a `media-src` addition in
`next.config.ts`.

`Track.playlistOnly` defaults to false. A true value marks a playlist
only track: it still names a soundtrack and style, but no emotion pick
ever returns it. `MusicManifest.playlists` holds
`Playlist = { id, label, trackIds }` entries, most notably
`just-play-chopin`. A missing key parses as an empty list, and a v2
migration gives an empty list. Parse rejects duplicate playlist ids,
empty labels, non-array `trackIds`, and any `trackIds` entry that names
no track, with the playlist and the id in the message.

## Soundtracks and selection

One soundtrack plays at a time. `MusicSelection = { mode, soundtrackId,
style }` is the session: `style` scopes every pick, `soundtrackId` is
the home in `soundtrack` mode, `mode` picks the ranking rule. The style
is the user's choice, changed with the style selector. The initial
soundtrack is the one covering the most hand-labeled emotions, ties by
lower id; a valid persisted id wins. The session persists `{ mode,
soundtrackId, style }` in localStorage under `lectoria.music.v1`. On
load a stored style with no tracks and a stored soundtrack outside the
stored style fall back to the defaults. Storage exceptions never break
playback.

In `soundtrack` mode each scene scores only the session soundtrack. When
the soundtrack has no track with the scene emotion, the scheduler borrows
the best same-style track for that scene only and reports `fallback`, so
the bar can say `de otra banda sonora`. In `random` mode each scheduled
select draws among same-style tracks with the scene emotion (or the best
same-style tracks when the emotion is missing) within `randomTolerance`
(0.05) of the best score, keeps the current track when it is eligible,
and avoids an immediate repeat otherwise. Dwell and min-track rules hold
in both modes. The core never calls `Math.random`; the reader injects it
and tests pass a seeded stub.

## Change track, mix toggle, style change

`nextTrack` cycles same-emotion tracks in score order, wrapping and
skipping the current. In `soundtrack` mode it stays inside the current
soundtrack first, then tries the same emotion in other same-style
soundtracks, then the best same-style track overall. In `random` mode it
ranges over all same-style soundtracks at once. A null scene cycles the
style set in id order.

The `Mezclar bandas` toggle flips `mode`. Turning it off keeps the
soundtrack of the playing track. `requestStyleChange` moves the session
to the best-coverage soundtrack of the new style and picks the best
match for the scene inside that soundtrack, or the best same-style track
by score when the picked soundtrack lacks the scene emotion. It never
crosses styles. The scheduler applies it at once with the normal
crossfade and holds the choice like a Next. There is no
soundtrack-change button.

## Playlist mode

`SchedulerState.playlist` holds `{ id, index }` while a fixed playlist
plays. `enterPlaylist` switches at once to the first `trackIds` entry
with `crossfadeSec`, no dwell and no min-track rule. While it is on,
scene changes update the active scene but never switch, `requestNext`
and `noteTrackEnded` advance to the next entry in order and wrap from
the last to the first, and playlist tracks run to their end because the
player forces looping off. `exitPlaylist` clears the playlist state and
switches at once to the best match for the current scene under the
restored selection. The mode is never persisted, so a reload returns to
emotion mode. The mix toggle and the style selector stay disabled while
it is on, and the style list hides styles with only playlist tracks.

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
`MUSIC_CONFIG`, holds `similarity`, `weights`, `switchMargin` (0.07),
`dwellSec` (20), `minTrackSec` (45), `hardCutMargin` (0.20),
`crossfadeSec` (3), and `hardCutCrossfadeSec` (1.5). Everything else
reads from it. Ranking ties go to the lower track id.

## Selection scheduler

`core/music-schedule.ts` is a pure state machine. The reader calls
`observeScene`, `tickScheduler`, `requestNext`, and `noteTrackEnded`
with explicit `nowSec` values, so all timing is testable without
timers. State holds the current track id and when it started, the active
scene id, the pending scene id and since when, and the skip override
with the scene it belongs to.

A newly entered scene becomes pending and the dwell clock restarts, so
fast scrolling keeps only the newest scene. The first track ever plays
at once with no dwell. After the pending scene holds for `dwellSec` it
becomes active and the override clears. Then the best track switches in
only when it beats the current score by `switchMargin` and the current
track played `minTrackSec`, unless it wins by `hardCutMargin` (hard
cut, short fade). A second passes the active scene back through the
switch check, so a hold from `minTrackSec` releases on time, unless a
skip override stands: ticks return no change while it is set, and only
a new scene promotion clears it. A switch
reports its crossfade length: 3 s normally,
1.5 s for hard cuts. The skip choice holds until the next scene change;
after that, dwell and hysteresis apply with the override track as the
current track. A null scene means a failed analysis with no vector, so
it never triggers a switch. A non-looping track that ends fades into
the best remaining track, excluding the one that ended, and clears the
skip override.

## Player

`app/player.tsx` takes the track, the fade length for the latest switch,
the scene title, a skip flag, and callbacks. It owns two `audio`
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

The bar shows Play/Pause, Volume, a Cambiar track button (disabled when
Next has nothing to offer), a Mezclar bandas toggle with `aria-pressed`,
and a style selector listing only styles that have tracks (hidden while
fewer than two qualify). A `Just play Chopin` toggle appears only when
the manifest defines that playlist with tracks; its text comes from the
playlist label, it carries `aria-pressed`, and it shows the Meta blue
accent while pressed. It shows the track title with its emotion
label, the soundtrack name, and attribution when present: composer or
artist, license, and a source link. While the playlist plays, the bar
hides the emotion label and the fallback note. A fallback pick adds the
quiet note
`de otra banda sonora`. On manifest failure the reader still renders and
the bar shows a short neutral note. UI motion stays under 200 ms.
Controls are real buttons and inputs with labels, visible focus, and
keyboard use. `app/player.tsx` keeps the audio engine and bar layout;
`app/player-controls.tsx` holds the buttons and the style selector;
`app/music-prefs.ts` owns the storage helper.

## Image api

`POST /api/images` (Node runtime, `maxDuration` 120). Request is a
discriminated union: `{ kind: "passage", bookId, textVersion, n }` names
the paragraph where the selection starts, `{ kind: "scene", bookId,
textVersion, sceneId }` names the scene. Validation is strict: known
book, matching `textVersion`, integer `n` inside the book, known
`sceneId`. Any other body is a 400 with a generic Spanish message.
The client sends ordinals and ids only, never text.

Responses (typed in `core/types.ts`): `{ status: "ready", url, cached,
caption }` with a Vercel Blob URL, never bytes; `{ status: "pending" }`
when another request holds the lock, in which case the client reposts
every 3 s up to about 2 minutes; `{ status: "error", code, message }`
where code is `quota`, `budget`, `unavailable`, or `bad_request` with a
friendly Spanish message. Caption is the scene title for scenes and the
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
