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

