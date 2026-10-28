# Task 10: English UI and one music mode

All user-facing strings are English now: the reader pager ("Previous",
"Next", "Chapter", "Chapter 5 · … · Scene 2 of 7 · Page 1 of 3"), the
picture panel ("Illustrate passage", "Illustrate scene", "Illustrating…",
"New", "Saved"), the player, the image API errors, and every aria-label.

The soundtrack mix toggle is gone. Selection spans all tracks in the
current style with the former cross-soundtrack scoring as the only rule.
`MusicSelection` keeps `style` only; `mode`, `soundtrackId`, and
`mixOffSelection` are deleted with their tests. Old localStorage prefs
load by `style` alone and ignore unknown fields. The no-immediate-repeat
rule and its tests stay.

"Next track" is a quiet skip-forward icon button (inline SVG, 32 px hit
area, Meta blue on hover). The bar reads play/pause, now-playing line,
volume, skip, style selector ("Orchestra / Piano"), then Just play Chopin.

The now-playing line shows `title · performer · source` from the track
and its soundtrack credit, truncated, with the full credit plus license
in the tooltip. `formatNowPlaying` builds it and has tests.

The scene heading takes focus only after an in-app scene navigation, so
first load shows no focus ring.

Style option names and soundtrack credit strings come from
`public/music/manifest.json`, which another worker owns and were left
alone.
