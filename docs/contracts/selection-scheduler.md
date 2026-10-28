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

