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

The library is a static `public/music/manifest.json`, version 2, fetched
by the client from `/music/manifest.json`. A static file needs no route,
ships from the CDN, and swaps by replacing files only. Tracks may be
several minutes long and are not loops unless marked so.

`MusicManifest = { version, tracks }`. `Track = { id, src, title,
emotion, vector, intensity, tempo, durationSec }` plus optional
`startSec` (default 0, where playback starts on first play and on each
loop), `loop` (default true), `source` (`generated`, `jamendo`, or
`recording`), `artist`, `composer`, `license`, `attribution`, and
`sourceUrl` (https only). `emotion` is the hand label: one of the 8
emotion ids in `core/types.ts`. The vector covers the 8 ids with finite
entries in 0..1. `core/music.ts` owns `parseManifest`, which rejects
unknown versions, missing fields, bad vectors, NaN entries, out-of-range
numbers, `startSec` outside its range, unknown `source` values, and any
`src` that is not a `/music/` path or `https` URL. The reader calls it on
every fetch, so a bad drop-in fails loudly in dev. Remote URLs need a
`media-src` addition in `next.config.ts`.

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

## Change track

`nextTrack` cycles tracks hand-labeled with the scene dominant emotion
(argmax of the renormalized scene vector, ties by emotion order), ranked
by score with ties by lower id, wrapping around and skipping the current
track. When the current track has another emotion, it starts at the top
candidate. With no other same-emotion track it falls back to the best
track overall that is not current. A null scene cycles all tracks in id
order. One track or none gives null, and the UI disables the button.

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

The bar shows Play/Pause, Volume, a Change track button (disabled when
Next has nothing to offer), the track title with its emotion label, and
attribution when present: composer or artist, license, and a source
link. On manifest failure the reader still renders and the bar shows a
short neutral note. UI motion stays under 200 ms. Controls are real
buttons and inputs with labels, visible focus, and keyboard use.

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
server checks the Blob path before generating and backfills the index.
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
