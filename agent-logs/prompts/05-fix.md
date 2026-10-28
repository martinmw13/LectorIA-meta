# Task 05 fix pass: review findings, selection engine, same-emotion Next, long tracks

You are working in this repo on branch `contracts-reader`. The uncommitted task 05 implementation is already in the tree (core/music.ts, core/reader.ts, app/reader.tsx, app/active-scene.ts, app/player.tsx, public/music/, docs/contracts.md). Do not start over; change it in place. Read AGENTS.md, docs/tasks/05-contracts-reader.md, docs/reviews/05.md and docs/reviews/external-opus-music-selection.md first.

Before writing code, read these skill files and follow them: ponytail (full), principle-foundational-thinking, principle-type-system-discipline, typescript-best-practices, principle-prove-it-works, unslop (for docs and UI copy). Several are user-invocable-only, so open their SKILL.md directly.

Hard rules: core/ stays pure (no env, fetch, fs, DOM, timers). No new dependencies. Desktop only, minimalist, Meta blue tokens from app/tokens.css, never purple, no gradients. Every file must pass `npm run check:size`. Do not run Modal or generate audio. Do not commit; I commit.

## A. Review findings (docs/reviews/05.md)

Fix findings 1 to 9. Finding 10: read reduced motion once in state with a change listener, but reduced motion affects visuals only, never the audio fade. Finding 11 goes away with the player rewrite in section E.

Observer (finding 1): use observer entries only as a trigger; on every callback re-snapshot every section's live rect and pick the last section whose top is at or above the reading line (fallback: first section). Keep the picker pure in app/active-scene.ts and test it with scroll-down, scroll-up and jump snapshots.

## B. Manifest v2 (agnostic track source)

The music source changed: real public-domain or CC classical recordings by one composer, hand-labeled by Martin. Tracks may be several minutes long and are not designed as loops. Bump the manifest to `version: 2` and make parseManifest accept only 2. Track fields:

- required: `id`, `src` (/music/ path or https URL), `title`, `emotion` (one EmotionId from core/types EMOTIONS, the hand label), `vector` (Vector8, every entry finite and 0..1), `intensity` 0..1, `tempo` 0..1, `durationSec` > 0
- optional: `startSec` (>= 0 and < durationSec; where playback starts on first play and on each loop), `loop` (default true), `source` ('generated' | 'jamendo' | 'recording'), `artist`, `composer`, `license` (SPDX-like string), `attribution` (free text), `sourceUrl` (https only)

Rename `label` to `title`. Reject unknown `source` values and malformed optional fields with clear errors. Rename music's `SceneEmotion` to `SceneSignal` (finding 8). Update the placeholder manifest: oz-test-01 emotion `calma`, oz-test-02 emotion `suspenso`, `source: "generated"`, `license: "CC-BY-NC-4.0"`, attribution noting MusicGen placeholder output. Swapping sources must need no code change.

## C. Pluggable similarity and one config object (core)

- `export type Similarity = (scene: SceneSignal, track: Track) => number;`
- Default `bhattacharyya`: renormalize both 8-emotion vectors to sum 1 (all-zero vector gives E = 0), E = sum_k sqrt(s_k * t_k); score = 0.70*E + 0.15*(1-|I_s-I_t|) + 0.15*(1-|T_s-T_t|).
- Keep `cosineSimilarity` (existing buildFeatures cosine) as an exported alternative.
- One exported config object, e.g. `MUSIC_CONFIG` in core, with: `similarity`, `weights {emotion:0.70, intensity:0.15, tempo:0.15}`, `switchMargin 0.07`, `dwellSec 20`, `minTrackSec 45`, `hardCutMargin 0.20`, `crossfadeSec 3`, `hardCutCrossfadeSec 1.5`. Everything else reads from it; functions accept an optional config override for tests.
- Ranking ties: lower track id wins (string compare), deterministic.

## D. Pure selection scheduler and same-emotion Next (core)

Write a pure state machine (e.g. core/music-schedule.ts) that the reader calls with explicit `nowSec` values, so all timing is testable without timers:

- State: current track id, time the current track started, active scene id, pending scene id and since when, override (skip choice) and the scene it belongs to.
- Reading position enters a new scene: it becomes pending; the dwell clock restarts. Fast scrolling through several scenes keeps only the newest pending scene.
- First track ever (nothing playing): pick immediately, no dwell.
- After the pending scene has held for `dwellSec`, it becomes active and the override is cleared. Then switch only if best score - current score >= `switchMargin`, and the current track has played `minTrackSec`, unless best beats current by >= `hardCutMargin` (hard cut). A switch reports the crossfade length: `hardCutCrossfadeSec` for hard cuts, `crossfadeSec` otherwise.
- The reader's skip choice holds until the next scene change (active scene changes); dwell and hysteresis rules still apply after that, with the override track as the current track.

Change-track ("Next") semantics, Martin's product rule:

- scene dominant emotion = argmax of the scene's renormalized vector, ties broken by EMOTIONS order.
- candidates = tracks whose hand-labeled `emotion` equals the scene's dominant emotion, ranked by the similarity score (tie: lower id).
- Next cycles through the candidates in that order, wrapping around, skipping the current track. Example: scene is tristeza, current is a tristeza track the reader dislikes, Next plays a different tristeza track; pressing again moves to the next tristeza track, wrapping.
- If the current track is not among the candidates, Next plays the top candidate.
- Only if there is no other same-emotion track, fall back to the next-best track overall by score (skipping the current). With one track total, Next returns null or the same track and the UI disables the button.
- A null scene (failed analysis) cycles all tracks in id order.
- Next switches at once with `crossfadeSec` (user action, no dwell, no min-track rule) and sets the override.

Tests (vitest, core): Bhattacharyya math (identical vectors give E = 1, renormalization, unknown dropped), cosine alternative selectable via config, tie-break by id, hysteresis 0.07 boundary, dwell 20 s, min 45 s with hard-cut exception and 1.5 s fade, fast scroll keeps newest scene only, override held then cleared on scene change, and same-emotion Next: cycles in score order, wraps, skips current, starts at top candidate when current has another emotion, falls back to next-best overall when no other same-emotion track exists, null scene. Use a small fixture manifest with three tristeza tracks, one calma and one suspenso. Plus manifest v2 parse tests (NaN rejected, startSec range, bad source, sourceUrl not https, loop default).

## E. Player rewrite (app/player.tsx)

- Two audio elements, never use the `loop` attribute. Volume lives in a ref; the volume slider sets both gains through the ref and never re-runs the track effect or touches `src`.
- Equal-power crossfade (gains cos/sin over the fade time) driven by requestAnimationFrame, length given by the scheduler (3 s or 1.5 s). A new track request mid-fade cancels the pending fade and fades from the currently audible element to the newest track. No element ever stays at gain 0 when it is the audible one.
- On load of a track, seek to `startSec ?? 0` once metadata is available.
- Long tracks: when currentTime reaches duration - crossfadeSec and loop is true, crossfade into the other element playing the same track from `startSec ?? 0`. If loop is false, the scheduler/reader picks the next-best track (excluding the ended one) and fades into it.
- Pause and play act on both elements (finding 2). Nothing plays before the first user press.
- UI: Play/Pause, volume, "Change track" (disabled when Next has nothing to offer), current track title plus its emotion label (show emotion in Spanish as stored, e.g. "tristeza"), and attribution when present: composer/artist, license, and a link to sourceUrl (rel="noopener noreferrer", target _blank). Short copy, sentence case.

## F. Docs

Update docs/contracts.md (manifest v2 fields, Similarity, config object, scheduler rules, Next rule, long tracks, scenes.json vs analysis.json per finding 6) and public/music/README.md (how to drop in real recordings: copy files to public/music/, edit manifest.json, set emotion by hand, optional startSec and attribution; no code change). Run unslop on both. Add a short "Fix pass" note to docs/tasks/05-contracts-reader.md.

## G. Prove it works

Run and report: `npm test`, `npm run typecheck`, `npm run build`, `npm run test:hooks`, `npm run check:size`, `npm run check:secrets`, and `gitleaks detect --no-git --source . ` if available. Start `npm run start` on a free port, curl / and /music/manifest.json, confirm the manifest parses with parseManifest v2, then stop the server. Finish with a short summary of what changed and every check result.
