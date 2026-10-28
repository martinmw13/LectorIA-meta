# 39: music session transition

One transition path for the three music mode intents in
`core/music-session.ts`. No behavior change.

## What drifted

`dispatch` grew three near-copies of the same switch-exit-enter logic:

- `playlistToggled` exited via `exitPlaylist` with the stored selection
  and entered via `enterPlaylist`.
- `modeAdvanced` duplicated both, plus a `styleChanged` copy (route-null
  guard, same-style guard, `switchStyle`, null-switch guard, selection
  update).
- The copies had drifted: the route-null guard sits at the top of
  `styleChanged` but only on the style-to-style tail of `modeAdvanced`
  (`playlistToggled` never checks the route); the signal is computed
  inline in three places; target validation differs (`styleChanged`
  trusts the style and leans on the null-switch guard, `modeAdvanced`
  checks the mode list first); same-value no-ops compare different
  things (`selection.style` vs the view-based current mode); and
  playlist-on means no-op for `styleChanged` but exit-with-selection
  for `modeAdvanced`.

## The unification

One private `transition(session, ctx, to: ModeTarget)` owns the
signal, the scheduler decision, the fold, the selection update, and
the settle. `ModeTarget` is `{ kind: "style"; style }`,
`{ kind: "enterPlaylist"; playlistId }`, or
`{ kind: "exitPlaylist"; style: string | null }` (null exits under the
stored selection, a style exits under the target selection). The three
intents only map to a target, keeping their own guards that differ by
design (see `docs/contracts/music-session.md`).

## Behavior

Unchanged. Pinned first by `core/music-session-transition.test.ts`
(9 tests, green before and after), then refactored with all 34 session
tests green. No new module was needed; the file shrank.
