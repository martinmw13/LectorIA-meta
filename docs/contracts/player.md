## Player

`app/player.tsx` takes the track, `replayNonce`, the fade length for
the latest switch, `canPrev`/`canSkip` with their handlers, volume and
mute with their handlers, the ordered mode list with the current mode
and its advance handler, the end-of-track handler, and `playlistOn`,
which only drives the audio loop-off rule. It owns two `audio`
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
pressed it shows a 2 px Meta-blue ring plus scale 1.05. The style
stickers stay enabled while it plays: pressing one leaves the playlist
straight for that style with one crossfade, and pressing Chopin while
on Chopin exits the playlist keeping the session style. On manifest
failure the band shows `The music is resting. The book is all yours.`
Motion stays under 200 ms, except the image hover expand at 260 ms.
`app/player.tsx` keeps the audio engine, transport, and band layout;
`app/folio/music-style-control.tsx` holds the stickers and Chopin
button behind `{ modes, current, onAdvance }`;
`app/music-prefs.ts` owns storage, including the Chopin mode, through
one store: `createMusicPrefsStore` loads the full prefs once and every
partial `update` merges over them, so a volume or mute change never
clobbers the stored style or Chopin mode. The heading keeps
`:focus:not(:focus-visible){outline:none}`. No user-visible emotion
labels exist; ids stay as they are. `core/music-credit.ts` builds the
line as a pure function with tests. `core/music-history.ts` is the
bounded history stack; `requestManualTrack` holds a manual pick.

