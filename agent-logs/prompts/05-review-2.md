# Task 05 review, round 2

Review the uncommitted fix pass on branch `contracts-reader` (prompt: agent-logs/prompts/05-fix.md; first review: docs/reviews/05.md). Read the ponytail-review and blast-radius skill files directly and follow them. Do not change code. Append a section "## Round 2" to docs/reviews/05.md with numbered findings (severity, file:line, problem, fix), a checked-and-fine list, and the npm test / typecheck / build results.

Check against the fix prompt's rules (manifest v2, Similarity and MUSIC_CONFIG, scheduler dwell/hysteresis/min-track/hard-cut, same-emotion Next, long tracks, attribution UI, first-review findings 1 to 10). Trace these by hand and confirm or refute each with a concrete sequence:

1. Override overwritten: `tickScheduler` re-runs `evaluateSwitch` on the active scene every second with no check of `overrideId`. After the reader presses Change track, does the scheduler switch away within one second (gap >= hardCutMargin) or after minTrackSec (gap >= switchMargin)? Martin's rule: the reader's choice holds until the next scene change.
2. Loop re-trigger: `handleTimeUpdate` sets `loopArmedRef` then calls `requestPlayRef`, which resets `loopArmedRef.current = null`. During the 3 s loop fade the old element is still `audibleRef`, so do later timeupdate events restart the fade and reassign `src` repeatedly?
3. First press double start: `toggle` calls `requestPlay(next, 0)` and the `[started, trackId]` effect then calls `requestPlay(next, fadeSec)` again. If `fadeSec` is already 3, is the same track started twice or crossfaded into itself?
4. Loop and end handling use `MUSIC_CONFIG.crossfadeSec` directly; is that consistent with the one-config rule?
5. Pause during a fade: does the rAF fade keep running and finish with the wrong element paused or audible after resume?
6. Does `noteTrackEnded` respect the override and update `currentStartedSec`; does the reader's `activeId` state ever diverge from the scheduler's active scene (e.g. before the manifest lands)?
7. Same-emotion Next tests: do they cover cycle order, wrap, skip current, other-emotion start, fallback, null scene, one track?
