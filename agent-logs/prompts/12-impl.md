Implement task 12 on branch `music-session` in this workspace. Read AGENTS.md and SECURITY.md first. The spec below is binding; there is no separate design doc. First commit: a brief `docs/tasks/12-music-session.md` (at most 50 lines: the new interface, what moved, what was reused from the original Lectoria and why).

Skills to apply (read `.agents/skills/<name>/SKILL.md` directly): ponytail (full, in AGENTS.md), typescript-best-practices, principle-model-the-domain, principle-test-behavior-not-implementation, principle-subtract-before-you-add, unslop.

Rules: small logical commits with plain messages (the hook adds the Muse trailer), no --no-verify, no push. Do NOT start a server (`next start`/`next dev` hang in this sandbox). This is a pure refactor: user-visible behaviour must not change. Every existing test must keep passing unchanged, except tests of private helpers you delete; if you must edit an existing test, say why in the commit body. Every file stays under the 5000-token size hook (split modules if needed). Another worker edits `pipeline/` and scene data in parallel: do not touch `pipeline/`, `data/`, `public/`.

Run and report at the end: `npm test` (count before: 237), `npx next typegen`, `npm run typecheck`, `npm run build`, `npm run check:isolation`, `npm run test:hooks`, `npm run check:size`, `node scripts/check-secrets.mjs --all`.

# Task 12 spec: a music session module behind the reader, and one scope-rank-draw path

Owner decision (Martin, approved from an architecture review). Vocabulary: a deep module is a small interface over a lot of behaviour; the seam is the interface the reader calls.

## Part 1. Move the music session out of `app/reader.tsx`

Today `Reader` calls all 8 scheduler entry points (`observeScene`, `tickScheduler`, `requestNext`, `requestManualTrack`, `noteTrackEnded`, `enterPlaylist`, `exitPlaylist`, `switchStyle`) plus `nextTrack` (for canSkip), `pushHistory`/`popHistory`, and holds the session in refs (`schedRef`, `historyRef`, `liveRef`, ...). `applyDecision` holds load-bearing rules, the entry dwell is passed at 3 call sites, and Chopin playlist gating is duplicated in `changeStyle` and `canSkip`. None of that wiring has tests.

Create `core/music-session.ts`: pure, React-free, no timers, no `Date.now`, no `Math.random`, no storage. Suggested shape (adjust names if a better fit appears, keep it this small):

```ts
export interface MusicSession { /* plain data: scheduler state, history, selection, view */ }
export interface SessionView {
  currentId: string | null;   // track to play
  fadeSec: number;            // crossfade of the last switch
  replayNonce: number;        // bumped to restart / re-cue the same id
  canPrev: boolean;
  canSkip: boolean;
  playlistOn: boolean;
  style: string | null;       // current selection style (Reader persists it)
}
export interface SessionContext {
  manifest: MusicManifest;     // not needed if kept in the session
  signalOf: (sceneId: string) => SceneSignal | null;
  routeSceneId: string | null; // the scene the reader shows
  nowSec: number;              // fake clock in tests
  rng: Rng;                    // seeded in tests
}
export type MusicIntent =
  | { type: "sceneEntered"; sceneId: string }
  | { type: "tick" }
  | { type: "skip" }
  | { type: "previous" }
  | { type: "styleChanged"; style: string }
  | { type: "trackEnded"; trackId: string }
  | { type: "playlistToggled" };
export function startSession(manifest: MusicManifest, prefs: PersistedMusicPrefs | null): MusicSession;
export function dispatch(session: MusicSession, intent: MusicIntent, ctx: SessionContext): MusicSession;
```

`dispatch` returns the SAME object (===) when nothing changed, and keeps the same `view` object when the view did not change, so the reader's 1 s tick does not re-render. Behind the seam, preserve exactly today's rules from `app/reader.tsx` (read it closely before deleting anything):

- Decision protocol (today's `applyDecision`): when a decision has `switchToId !== null`, set `fadeSec = crossfadeSec`; if `switchToId` equals the previous `currentId` (one-track playlist wrap) bump `replayNonce` instead of changing `currentId`; otherwise every automatic switch pushes the outgoing id onto history (when not null), then sets `currentId`. Previous never re-pushes.
- `sceneEntered`: `observeScene` with the scene's signal and `MUSIC_CONFIG.sceneEntryDwellSec` as the dwell (one place, not three call sites).
- `tick`: needs a route scene; uses the pending scene's signal when one is pending, else the route scene's; `tickScheduler` with the same entry dwell.
- `skip`: needs a route scene; `requestNext` with the route scene's signal.
- `previous`: in playlist mode, or with empty history, bump `replayNonce` (restart from zero). Otherwise pop history and `requestManualTrack(popped id)` without pushing.
- `styleChanged`: ignored without a route scene, in playlist mode, or when the style is unchanged; `switchStyle`; if it returns no switch, nothing changes (selection included); otherwise apply and set the selection to the new style.
- `trackEnded`: needs a route scene; `noteTrackEnded`.
- `playlistToggled`: only when the manifest has the Chopin playlist (`CHOPIN_PLAYLIST_ID`) with at least one track (move `findChopinPlaylist` here). On: `exitPlaylist` with the route scene's signal (or null). Off: `enterPlaylist`. `parseManifest` guarantees playlist track ids exist, so `playlistOn` can derive from the scheduler's playlist state; keep one source of truth.
- `canSkip`: in playlist mode, the Chopin playlist has more than one track; otherwise the manifest has more than one track and `nextTrack(route scene signal, manifest, currentId, undefined, selection)` is not null. `canPrev`: `currentId !== null`. Recompute the view after every intent, using `ctx.routeSceneId`.
- Initial selection: `resolveInitialSelection(manifest, prefs)`.

`app/reader.tsx` keeps only: route param and the `nextSceneEntry` gate, manifest fetch, mount-time `loadMusicPrefs`, volume/mute React state, one session ref, one `view` React state, a small `send(intent)` helper (builds the context with `Date.now() / 1000` and `Math.random`), and `saveMusicPrefs` when the style, volume or mute changes. The `Player` props and markup stay the same. Delete what no longer has a caller (`liveRef` fields, `applyDecision`, `entryDwell`, `findChopinPlaylist`, `persist` if folded). If `core/music-history.ts` and the `requestManualTrack` entry point are used only by the session, they may stay as they are (do not merge for the sake of it).

Tests: `core/music-session.test.ts` (split into two files if needed for size), through `startSession` + `dispatch` only, with a fake clock (`nowSec` you advance) and a seeded rng (deterministic function). Cover at least: first scene entry plays at once with fade 0; a new scene switches only after the entry dwell (via `tick`); skip holds until the next scene change; previous returns to the track before a skip and does not re-push (a second previous goes further back, then restarts with a nonce bump when history is empty); trackEnded fades to another track and is undoable with previous; style change switches, updates `view.style`, and is ignored in playlist mode or for the same style; playlist on/off: Chopin first track, skip advances and wraps, a one-track playlist bumps the nonce on skip/end, previous restarts, exit returns to the scene's best match; canSkip/canPrev values; the tick returns the identical session object when nothing changes.

## Part 2. One scope, rank and draw path

Today one pick bounces across `core/music-selection.ts`, `core/music-schedule.ts` (`topRanked`, `evaluateRandom`) and `core/music-similarity.ts` (`rankTracks`). Collapse it, keeping every exported function name and signature that existing tests import (they may become thin wrappers):

- One audible-scope filter: the `playlistOnly !== true` check exists in exactly one function (today it is written in `candidatesFor`, `nextTrack`, `styleHasTracks`, `requestStyleChange`). Every scope (`candidatesFor`, `nextTrack` with no selection, `styleHasTracks`, `requestStyleChange`) goes through it.
- One id tie-break comparator (today the `a.id < b.id ? -1 : ...` sort is written 5 times: `rankTracks`, `nextTrack`, `pickRandomTrack`, `topRanked`, `requestStyleChange`).
- Scores computed once per track per pick: a ranked list of `{ track, score }` (best first, ties to lower id), not `similarity` inside the sort comparator. `rankTracks` maps over it; `pickRandomTrack` and `topRanked` reuse its scores instead of recomputing.
- The scheduled draw lives in one function in the selection module: tolerance window, keep-current-when-eligible, the min-track hold (today split between `pickRandomTrack` and `evaluateRandom`). `music-schedule.ts` keeps dwell, override, and playlist state and calls the selection module for every pick (scheduled select, Next, style change, end of track, playlist exit).
- Results must be identical: same order, same ties, same rng consumption (one `rng()` call per draw, only when a draw happens).

## What the original Lectoria already decided (reuse ideas and naming, never copy code)

The original repo is read-only reference; AGENTS.md forbids copying its code. Optional reading (read-only): `/workspace/lectoria/docs/adr/0002-frontend-audio-engine-is-a-plain-class.md`, `/workspace/lectoria/CONTEXT.md` (glossary: Crossfade, ReaderCursor, D12), `/workspace/lectoria/lectoria/services/music.py` (`_match_scene_core`, `MatchResult`). Ideas to carry over and name in `docs/tasks/12-music-session.md`:
1. Policy vs mechanism (ADR-0002): the audio engine executes crossfades but never decides them. Here `Player` stays the mechanism and `music-session` is the single policy owner.
2. Framework-free core plus a thin React container (ADR-0002, `ReaderCursor`): the session is pure and tested without a render; the reader only bridges it to React state.
3. One matching core as the single source of truth (`_match_scene_core`): candidate pool, then one ranking with scores computed once, then selection that honours exclusions and variety. Use "candidates" / "ranked" / "match" naming where it fits.
4. User skips last only for the current scene (the old player reset its skipped ids on scene change): matches today's override that clears on scene promotion. Keep it.

## Docs

Update `docs/contracts.md` (music section: the session interface replaces the reader wiring description) and `BUILT_DURING_HACKATHON.md` (task 12). Keep prose short and plain.
