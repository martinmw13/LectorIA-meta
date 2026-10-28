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
`provenance.resplit` in `analysis.json`: one entry per cut (`from`,
`at_n`, `margin`, `window_left`/`window_right` from the window means,
`final_left`/`final_right` from the re-classified parts,
`decided_by`), plus `merged_back` (parts re-classified to the same top
emotion and folded back), `rejected` (Muse declined), and
`window_failures` (Jev failed, scene left whole) and `muse_failures` (Muse resplit call or titles failed, scene left whole).

## Scene reader

One static route per scene (`app/leer/[sceneId]`, `dynamicParams`
false); `/` redirects to the first scene. The layout mounts the music
container once and passes slim metadata for all scenes: id, chapter,
and emotion triple only. Each scene page builds its view with
`buildSceneView` and ships only that scene's text, its chapter title,
and neighbor ids. Sub-pages come from `paginateScene`, which closes a
page when the next paragraph would pass 250 words or the line budget
(`FIRST_PAGE_LINES` 12 on page one, `LINES_PER_PAGE` 13 after, each
paragraph costing `ceil(chars / CHARS_PER_LINE)` lines with
`CHARS_PER_LINE` 58). Paragraphs that outlast a page split at a
sentence boundary (word fallback); fragments share `n`, later ones
carry `cont`, and rejoin exactly. A two-line chapter title
(`TITLE_CHARS_PER_LINE` 26) costs every page 2 lines. The pager moves sub-pages in client state and
pushes routes with `router.push`, never `<Link>`; going back lands on
the previous scene's last sub-page through a one-shot client flag, never
a URL param, so prerendered pages stay static. The client never
receives other scenes' text, titles, or summaries. One grid holds the
top line, image pane, reading column, vault margin, and bottom band;
route wrappers use `display: contents`, so music state persists across
routes with no portal. The top line reads `LECTORIA`, book and author,
then `Chapter N of 24` as a quiet chapter jump (a native select styled
as text, options `1. The Cyclone`), then the theme toggle. Each page
opens with a kicker `Chapter N`, the chapter title in Newsreader, then
muted `Scene k of n` (plus `Page i of m`); no scene name appears
anywhere. Book type is 20.5px / 1.7, no paragraph gaps, 1.5em indent,
blue drop cap on page one. The body never scrolls at 1280×800; the
reading column scrolls inside itself. The word budget stays the upper
bound and the line budget keeps every sub-page inside 1280×800 without
scroll.

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
dwell override; scoring and overrides are unchanged. One path scopes,
ranks, and draws: `audibleTracks` is the one playlist-only filter,
`compareTrackId` the one tie-break, `rankScored` scores each track once
(best first, ties to lower id), and `selectScheduled` runs the tolerance
window, keep-current, and min-track hold with one rng call per draw.

## Music session

`core/music-session.ts` is the single policy owner behind the reader.
The reader sends intents (`sceneEntered`, `tick`, `skip`, `previous`,
`styleChanged`, `trackEnded`, `playlistToggled`) through
`startSession` and `dispatch` with explicit `nowSec` and `rng` values,
so all timing is testable without timers or a render. `dispatch`
returns the same session object when nothing changed, so the 1 s tick
rerenders nothing. The reader cues music on scene entry only: one
`sceneEntered` per route id, gated by an id comparison, so sub-page
moves never reach the session. The session holds the scheduler state,
the Previous history, the selection, the fade, and the replay nonce,
and derives the view the player renders: track id, fade, nonce,
canPrev/canSkip, playlist flag, style.

## Selection scheduler

`core/music-schedule.ts` is a pure state machine. The session calls
`observeScene`, `tickScheduler`, `requestNext`, `noteTrackEnded`,
`requestManualTrack`, `switchStyle`, `enterPlaylist`, and
`exitPlaylist` with explicit `nowSec` values, so all timing is testable
without timers. State holds the current track id and when it started, the active
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

The bottom band is one row: the pager with book ticks left, the player
centre-right. The pager reads `Scene k of n` between `‹` `›` buttons
(`Previous page` / `Next page`, arrow keys keep working), above one
tick per scene (current in accent) and muted `Scene i of N`. The player
holds Previous, Play/Pause, Next, mute (`Mute` / `Unmute`), a `Volume`
slider, the now-playing line (ellipsis, full line in `title`), then
the stickers and Chopin. The line shows `display title · composer`,
then the source artist as a link with an arrow icon when the manifest
gives a URL. Orchestra and Piano are sticker buttons
(`/art/stickers/violin.svg`, `/art/stickers/piano.svg`, Noto Emoji,
Apache-2.0), shown while two styles have tracks, with `aria-pressed`
for the selected one, a white die-cut outline, and a Meta-blue dot
below it. Previous walks the session history and restarts the track
with no history; Next cycles same-emotion tracks in the style.
A `Just play Chopin` round image button (`/art/chopin-just-play-me.png`,
40 px) appears only when the manifest defines that playlist; while
pressed it shows a 2 px Meta-blue ring plus scale 1.05. On manifest
failure the band shows `The music is resting. The book is all yours.`
Motion stays under 200 ms, except the image hover expand at 260 ms.
`app/player.tsx` keeps the audio engine, transport, and band layout;
`app/player-controls.tsx` holds the stickers and playlist toggle;
`app/music-prefs.ts` owns storage. The heading keeps
`:focus:not(:focus-visible){outline:none}`. No user-visible emotion
labels exist; ids stay as they are. `core/music-credit.ts` builds the
line as a pure function with tests. `core/music-history.ts` is the
bounded history stack; `requestManualTrack` holds a manual pick.

## Image api

`POST /api/images` (Node runtime, `maxDuration` 120). Request is a
discriminated union: `{ kind: "passage", bookId, textVersion, n }` names
the start paragraph, `{ kind: "scene", bookId, textVersion, sceneId }`
names the scene. Validation is strict: known book, matching
`textVersion`, integer `n` in the book, known `sceneId`. Anything else
is a 400 with a generic English message. The client sends ordinals
and ids, never passage text (except custom style text, validated
server-side). "Illustrate scene" uses the scene id from
the route.

Responses (typed in `core/types.ts`): `{ status: "ready", url, cached,
caption }` with a Vercel Blob URL, never bytes; `{ status: "pending" }`
when another request holds the lock, so the client reposts
every 3 s up to ~2 minutes; `{ status: "error", code, message }`
where code is `quota`, `budget`, `daily_budget`, `unavailable`, or
`bad_request` with a friendly English message. Both `budget` and
`daily_budget` answer `MSG_CREDITS_OUT` (`core/images.ts`), which never
says "come back tomorrow"; the UI links its Oz sentence via
`CREDITS_OUT_LIBRARY_HREF` (`"/"`). Caption is the scene title, or the
paragraph's first words, built server-side. The style contract lives in
`docs/contracts-image-style.md`.

The passage cache key is book plus start paragraph plus `textVersion`
plus `PROMPT_VERSION` (`v1`); the scene key swaps in the scene id.
Both map to a deterministic Blob path (`addRandomSuffix: false`,
`allowOverwrite: false`). An Upstash Redis index maps key to Blob URL
(hits are one GET); on a miss the server lists by path prefix,
generates, and backfills the index. Quota is 5 new images per person
per day by hashed IP and signed cookie, whichever runs out first; spend
sits under `SPEND_CAP_USD` (default 10) in integer micro-dollars, plus
a daily counter per UTC day under `DAILY_SPEND_CAP_USD` (default 2,
48 h key TTL). Failures refund quota and both counters and release the
lock. Both caps apply only to requests paid with our key (a future
bring-your-own-key path skips them).

## Picture vault and style pref

The pane shows the scene picture behind a `Picture this scene` pill on
a paper-grain placeholder (`Sketching…` while loading, retry on
error). The image fills the pane, expands on hover (max 72vw by 78vh),
and opens the shared lightbox on click. `Picture this` pops
8 px above a 3+ char selection and inserts one figure after the
selection end paragraph (`pickEndN` over ordinals), captioned with the
selected text. Figures persist per scene in client memory, one request
at a time. The vault lists the scene picture first, then figures in
text order, each with jump-to-figure pulse and expand; the style picker
below stores the pref in `lectoria.imageStyle`, `requestStyleFields`
sends it on every request, and the credit names the sent style (else
`In the style of W. W. Denslow`).

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
