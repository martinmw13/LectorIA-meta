# Task 10: English UI and one music mode

All user-facing strings are English: the reader pager ("Previous",
"Next", "Chapter 5 · … · Scene 2 of 7 · Page 1 of 3"), the player,
"Picture scene" / "Picture this" / "Illustrating…" / "New" / "Saved",
the image API errors, and every aria-label. `<html lang="en">` already
held; the favicon is a Meta-blue open-book `app/icon.svg`.

The soundtrack mix toggle is gone. Selection spans all tracks in the
current style with the former cross-soundtrack scoring as the only rule.
`MusicSelection` keeps `style` only; `mode`, `soundtrackId`, and
`mixOffSelection` are deleted with their tests. Old localStorage prefs
load by `style` alone. The no-immediate-repeat rule and its tests stay.

Transport is three icon-only SVG buttons (32 px hit area, Meta blue on
hover): Previous walks a bounded session-history stack in
`core/music-history.ts` and restarts the track with no history; Play/Pause
is one toggle; Next cycles same-emotion tracks in the style. A manual
pick holds through `requestManualTrack` so scene logic does not switch
away at once.

The now-playing line is `title · composer · source` from real manifest
fields: title kept as given, `composer ?? artist`, source is the short
credit (`artist`), never repeated. Line plus license and attribution sit
in the tooltip. `nowPlaying` in `core/music-credit.ts` has fixture tests
copied from the manifest. Gain and segment-end playback from PR #10 are
untouched, as are the manifest, converter, credits, and CSP.

"Picture scene" sits right-aligned on the progress row; "Picture this"
pops above a ≥3-char mouse selection and sends ordinals only. The image
renders inline under the heading (320 px max, caption, Saved/New tag,
dismiss); the companion aside and chat line are gone.

The scene heading takes focus only after an in-app navigation, so first
load shows no focus ring.
