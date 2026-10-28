# Task 12: music session module and one scope-rank-draw path

Pure refactor, no behavior change. All 237 existing tests keep passing.

## New interface

`core/music-session.ts` owns every music decision. The reader bridges
it to React state and never decides.

```ts
startSession(manifest, prefs): MusicSession
dispatch(session, intent, ctx): MusicSession // same object when unchanged
```

`MusicSession` is plain data: scheduler state, history, selection,
fade, replay nonce, and a cached view. `SessionView` is what `Player`
renders: track id, fade, replay nonce, canPrev/canSkip, playlist flag,
style. Intents: sceneEntered, tick, skip, previous, styleChanged,
trackEnded, playlistToggled. The reader builds the context (manifest,
scene signals, route id, clock, rng) in one `send` helper.

## What moved

Out of `app/reader.tsx` into the session: `applyDecision`, the entry
dwell, `findChopinPlaylist`, the prev/next/playlist/style/ended rules,
and the canSkip/canPrev math. The reader keeps route gating, manifest
fetch, prefs load/save, volume/mute state, and the `Player` markup.

Into `core/music-selection.ts`: the scheduled draw (tolerance window,
keep-current, min-track hold) and the best-match pick, so the
scheduler only keeps dwell, override, and playlist state. One audible
scope filter, one id tie-break, scores computed once per pick.

## Reused from the original Lectoria (ideas and names, no code)

Policy vs mechanism (ADR-0002): `Player` performs crossfades, the
session decides them. Framework-free core plus thin container
(ADR-0002, `ReaderCursor`): tested with a fake clock and seeded rng,
no render. One matching core (`_match_scene_core`): candidates, then
one ranked list with scores computed once, then selection with
exclusions; `ranked` naming kept. Skips hold only for the current
scene, cleared on promotion, as the old player did.
