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

