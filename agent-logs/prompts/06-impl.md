Implementation step for task 6 (Contributor). Implement docs/tasks/06-soundtracks.md as amended by the owner change below, following the spec below. Branch `soundtracks`, uncommitted working tree. Do not commit or push. Do not edit `.agents/skills/`; the only edit allowed in docs/tasks/06-soundtracks.md is appending the owner change section. Read AGENTS.md and SECURITY.md first. Apply ponytail (full), architect, typescript-best-practices, principle-type-system-discipline, principle-test-behavior-not-implementation, principle-prove-it-works, unslop and technical-writing. Several are user-invocable-only, so the skill tool reports them as disabled; that is expected. Read their files directly (`.agents/skills/<name>/SKILL.md`) and follow them. Do not stop to ask; proceed. Do not run Modal or generate audio.

Notes:
- Keep changes as small as a clean design allows; reuse rankTracks, dominantEmotion, nextTrack and the scheduler rules instead of duplicating them.
- Keep every file under the check:size limit; split app/player.tsx by concern if it grows.
- Never use the `loop` attribute, keep the existing crossfade and loop behavior and the rescue guard in handleEnded (see RESCUE_LOG.md) intact.
- When finished, run `npm run build && npm run start` on a free port briefly and curl `/` and `/music/manifest.json`; stop the server afterward.

Final message: files changed, the contract changes in one line each, test results for every check, and anything skipped.

## Owner change after the design (binding, overrides the design and the spec where they differ)

Martin simplified the UI to TWO controls. First, add a short "Owner change" section at the end of docs/tasks/06-soundtracks.md recording this (a few lines), then implement it:

1. "Cambiar track" button: next track with the same dominant emotion, cycling in score order, wrapping, skipping current. With mixing off (mode `soundtrack`): inside the current soundtrack first, then the same emotion in other same-style soundtracks, then the existing fallback (next best same-style overall). With mixing on (mode `random`): across all same-style soundtracks with the same emotion, then the fallback.
2. ONE toggle labeled "Mezclar bandas" (`aria-pressed`, off by default). Off = mode `soundtrack`: keep the same soundtrack scene to scene. On = mode `random` exactly as specified (random among same-style tracks across soundtracks matching the scene emotion within `randomTolerance`, no immediate repeat, injected rng, keep current when eligible). Turning it off keeps the soundtrack of the currently playing track.
3. Initial soundtrack (no valid persisted choice): the soundtrack with the best emotion coverage in the manifest (most distinct hand-labeled emotions among its tracks), ties broken by lower id. The session style is that soundtrack's style. A valid persisted soundtrack id still wins.
4. REMOVE "Cambiar banda sonora" entirely: no button, no `requestSoundtrackChange`, no `nextSoundtrack`, no tests for it. There is no separate "Aleatoria" button; the toggle is the only mode control.

Everything else stays: style filter always on, per-scene fallback flag and the quiet "de otra banda sonora" note, persistence of `{ mode, soundtrackId }`, soundtrack name in the player bar, manifest v3, tests (replace the change-soundtrack tests with tests for the initial-soundtrack coverage rule and for Next with mixing on vs off), docs.

5. Style selector (owner addition). Manifest v3 gets a required top-level `styles: { id: string; name: string }[]` (id = lowercase slug, name = Spanish display name). Every soundtrack style and track style must be a listed style id; parseManifest rejects unknown ones and duplicate style ids. The committed placeholder manifest lists `{ "id": "orchestral", "name": "Orquesta" }` and `{ "id": "piano", "name": "Piano" }` (piano has no tracks yet). v2 migration adds `styles: [{ id: "orchestral", name: "Orquesta" }]`.
   - The player shows a style selector (a native `select` or a small segmented control, labeled, keyboard usable) listing only styles that have at least one track, by display name. Hide it when fewer than two styles have tracks (so it is hidden today).
   - Style is no longer fixed for the whole session: it is the user's choice. Changing style is a user action: the session soundtrack becomes the best-coverage soundtrack within the new style (same coverage rule, ties by id), the scheduler switches at once (no dwell, no min-track rule) with `crossfadeSec` to the best match for the current scene within the new style, and sets the override like Next. The "Mezclar bandas" semantics stay the same inside the new style. Expose this as one pure core function (e.g. `requestStyleChange`).
   - If the new style has no track of the scene's dominant emotion, pick the best same-style track by score. Never cross styles, in any mode or fallback.
   - Persist `{ mode, soundtrackId, style }`. On load, ignore a stored style with no tracks and a stored soundtrack that is not in the stored style; fall back to the defaults.
   - Tests: style switching (switch is immediate, lands in the new style, sets the soundtrack by coverage, later scenes stay in that style), the fallback when a style lacks the scene's emotion (best same-style by score), and never crossing styles. Fixture: add a piano soundtrack with only some emotions.

The spec:

# Task 6 spec: soundtracks, change soundtrack and random mode

Repo: LectorIA-meta, branch `soundtracks`, worktree root is the workspace. Read AGENTS.md and SECURITY.md first; they are binding (core purity, server-only, generic client errors, design palette from app/tokens.css, Meta blue accent, never purple, desktop only, writing rules). Builds on task 5 (docs/tasks/05-contracts-reader.md, docs/contracts.md, core/music.ts, core/music-schedule.ts, app/player.tsx, app/reader.tsx).

Owner decision (Martin, the product owner): while reading, the music stays with the same orchestra or source from scene to scene. A button changes the soundtrack (moves to another orchestra or source), and a random toggle mixes sources. Emotions are always respected. Style and instrumentation stay consistent (never orchestral then electronic), but it does not have to be the same recording or band.

Skills to apply (read `.agents/skills/<name>/SKILL.md` directly; several are user-invocable-only): architect, principle-foundational-thinking, principle-type-system-discipline, principle-model-the-domain, typescript-best-practices, ponytail (full, in AGENTS.md), principle-prove-it-works, principle-test-behavior-not-implementation, unslop, technical-writing.

## 1. Manifest v3 (core/music.ts)

- `version: 3`. parseManifest accepts 3. It also accepts 2 by migrating it: a v2 manifest becomes one implicit soundtrack `default` (name "Default", style `orchestral`) and every track gets `soundtrack: "default"`, `style: "orchestral"`. Keep that migration a few lines; if it grows, drop v2 and say so in the doc.
- Top level adds required `soundtracks: Soundtrack[]`, `Soundtrack = { id: string; name: string; style: string; credit?: string }`. ids unique, non-empty; `style` a non-empty lowercase slug (e.g. `orchestral`, `piano`, `chamber`). Style is a free slug, not an enum, so a new style needs no code change.
- Each Track adds required `soundtrack` (a Soundtrack id) and `style` (slug). parseManifest rejects: unknown soundtrack id, a track style that differs from its soundtrack's style, duplicate track ids, duplicate soundtrack ids, a soundtrack with no tracks is allowed (warn not needed). Clear error messages naming the track id.
- Example ids: `musopen-cnso`, `musopen-skidmore`, `jamendo-orchestral`, `placeholder-musicgen`.
- Update public/music/manifest.json to v3: one soundtrack `placeholder-musicgen` (name "MusicGen placeholder", style `orchestral`, credit noting MusicGen placeholder output, CC-BY-NC-4.0), both clips belong to it with `style: "orchestral"`.

## 2. Selection state (pure, core)

`MusicSelection = { mode: "soundtrack" | "random"; soundtrackId: string | null; style: string | null }`.

- Style is fixed for the session. Default: the style of the first chosen soundtrack (the first soundtrack in manifest order that has tracks, unless a persisted choice is valid). The candidate set is always filtered by style.
- Mode `soundtrack` (default): selection for each scene considers only tracks of the current soundtrack, with the existing scoring (Bhattacharyya by default), hysteresis, dwell, min track time, hard cut and crossfade config. If the current soundtrack has no track whose hand-labeled `emotion` equals the scene's dominant emotion, fall back for that scene only to the best same-style track from any soundtrack with that emotion (then best same-style overall). This does not change the session soundtrack. The decision reports that it is a fallback so the player can say so.
- "Cambiar track" (existing Next): other tracks with the same dominant emotion inside the current soundtrack, cycling in score order, wrapping, skipping the current. If none, the same emotion in other same-style soundtracks. Then the existing fallback (next best overall within the style).
- "Cambiar banda sonora": moves the session to the next same-style soundtrack in stable manifest order, cycling, that has a track for the current scene's dominant emotion. It switches at once (user action, no dwell, no min-track rule) with `crossfadeSec` to that soundtrack's best match, sets the override like Next, and stays on that soundtrack for later scenes. Disabled (returns null) when no other soundtrack qualifies. If the scene is null (failed analysis), it moves to the next same-style soundtrack that has any track.
- "Aleatoria" toggle, mode `random`: on each scene change (when the scheduler would select), pick randomly among same-style tracks across all soundtracks whose emotion matches the scene's dominant emotion and whose score is within `randomTolerance` of the best such score (add `randomTolerance: 0.05` to MUSIC_CONFIG with a one-line why). If no track matches the emotion, use the best same-style tracks within tolerance. Avoid repeating the immediately previous track when an alternative exists. The RNG is injected (`rng: () => number`, default Math.random in the app only) so tests are deterministic; core never calls Math.random by itself. Dwell and min-track rules still apply in random mode; the hysteresis margin does not (any eligible pick is fine), but keep the current track when it is itself eligible, so random mode does not churn on rescans.
- Toggling random off returns to `soundtrack` mode with the soundtrack of the currently playing track.
- Persist `{ mode, soundtrackId }` in localStorage (app side, one small helper, key like `lectoria.music.v1`). On load, ignore a persisted soundtrack id that is not in the manifest or not in the style. Guard against storage exceptions (private mode).

Integrate with core/music-schedule.ts with the smallest change that stays clean: e.g. the scheduler takes the selection and rng in its inputs, or a pure `candidatesFor(selection, manifest)` filter plus a soundtrack-aware ranking. Decide in the design and say why in one line. Keep all functions pure with explicit `nowSec`, no real timers in tests.

## 3. Player bar (app/player.tsx)

- Shows the soundtrack name next to title, emotion, composer or artist, license, attribution link (existing). When the current track is a fallback from another soundtrack, show a short quiet note, e.g. "de otra banda sonora".
- Buttons: "Cambiar track" (existing), "Cambiar banda sonora" (disabled when nothing qualifies), and an "Aleatoria" toggle (`aria-pressed`). Real buttons, aria-labels, visible focus, keyboard usable. UI copy in Spanish, short, sentence case, no AI slop. Minimalist, tokens only, Meta blue accent, never purple, no gradients, motion under 200 ms except audio fades.
- Keep app/player.tsx under the file size limit; split by concern if needed (e.g. a small controls component, a persistence helper).

## 4. Tests and docs

- Unit tests in core (vitest, no real timers, seeded rng): manifest v3 parse (unknown soundtrack, style mismatch, duplicate ids, v2 migration), soundtrack-mode selection stays inside the soundtrack across scenes, per-scene fallback when the soundtrack lacks the emotion (session soundtrack unchanged, flag set), Next inside soundtrack then other same-style soundtracks, Cambiar banda sonora cycles in manifest order, skips soundtracks without the emotion, stays for later scenes, returns null when none qualifies, random mode picks within tolerance and only matching emotion and style, avoids immediate repeat, deterministic with a seeded rng, toggle off adopts the playing track's soundtrack, style filter never crosses styles (fixture with an `electronic` soundtrack that must never be picked while the style is orchestral). Fixture: two orchestral soundtracks with overlapping emotions (one missing an emotion) plus one electronic soundtrack. Persistence helper test for invalid stored ids if it is pure.
- The existing committed-manifest test keeps passing (every src exists).
- Update docs/contracts.md (manifest v3, soundtracks, style rule, selection modes, Next and change-soundtrack rules, random mode, persistence) and public/music/README.md (how to add a soundtrack: add a `soundtracks` entry, set `soundtrack` and `style` on each track, keep one style per soundtrack, no code change). Unslop both. Sentence-case headings, no em dashes, short.
- Add a row to BUILT_DURING_HACKATHON.md like task 5.

## 5. Prove it works

Run and report: `npm test`, `npm run typecheck`, `npm run build`, `npm run test:hooks`, `npm run check:size`, `node scripts/check-secrets.mjs --all`, and `gitleaks dir . --redact --no-banner` if available. Start `npm run start` on a free port, curl / and /music/manifest.json, confirm the manifest parses as v3, stop the server. Do not run Modal or generate audio. Do not commit or push.
