## Music session

`core/music-session.ts` is the single policy owner behind the reader.
The reader sends intents (`sceneEntered`, `tick`, `skip`, `previous`,
`styleChanged`, `trackEnded`, `playlistToggled`, `modeAdvanced`)
through `startSession` and `dispatch` with explicit `nowSec` and `rng`
values, so all timing is testable without timers or a render. `dispatch`
returns the same session object when nothing changed, so the 1 s tick
rerenders nothing. The reader cues music on scene entry only: one
`sceneEntered` per scene in view, gated by an id comparison, so
scrolling inside one scene never reaches the session. The session holds the scheduler state,
the Previous history, the selection, the fade, and the replay nonce,
and derives the view the player renders: track id, fade, nonce,
canPrev/canSkip, playlist flag, style. `modeAdvanced` (with an optional
`to` target) walks the `core/music-modes.ts` order: style to style
works like `styleChanged`, style to Chopin like entering the playlist,
Chopin to Chopin exits keeping the stored selection like `playlistToggled`
exiting, and Chopin to a style exits under the target selection in one
switch with one crossfade. `playlistToggled` and `styleChanged` still work. A
stored Chopin mode starts the session in the playlist; without the
playlist the stored style stands. Persistence itself lives in
`app/music-prefs.ts`: one store owns the prefs and partial updates
merge over the last known full object.

All three mode intents route through one `transition` function taking a
`ModeTarget` (`style`, `enterPlaylist`, or `exitPlaylist` with a style
or null). The transition owns the signal, the scheduler decision
(`switchStyle`, `enterPlaylist`, `exitPlaylist`), the fold, the
selection update, and the settle. Each intent only maps to a target,
plus its own guards that differ by design: `styleChanged` keeps the
route-null guard, the playlist-on no-op, and the same-selection no-op;
`playlistToggled` keeps the missing-playlist no-op and never checks the
route; `modeAdvanced` keeps target validation against the mode list,
the same-mode no-op, and the route-null and same-selection guards on
the style-to-style tail only, so playlist paths act even with a null
route.

