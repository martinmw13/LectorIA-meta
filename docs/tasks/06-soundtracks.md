# Design: task 6 soundtracks, change soundtrack and random mode

Goal: while reading, music stays inside one soundtrack. A button moves to another soundtrack, a toggle mixes sources at random, emotions always win. This step writes only this doc. The implementer writes the code, tests, and doc updates on branch `soundtracks`. Binding inputs: AGENTS.md, SECURITY.md, task 5 contracts, `core/music.ts`, `core/music-schedule.ts`, `app/player.tsx`, `app/reader.tsx`.

## Manifest v3 types and parsing

New types in `core/music.ts`:

```ts
export interface Soundtrack { id: string; name: string; style: string; credit?: string; }
export interface MusicManifest { version: number; soundtracks: Soundtrack[]; tracks: Track[]; }
```

`Track` gains required `soundtrack: string` (a soundtrack id) and `style: string` (slug copy). Style stays a free lowercase slug, never an enum, so a new style needs no code change.

`parseManifest` keeps its signature and accepts versions 2 and 3. Version 2 migrates inline: one implicit soundtrack `{ id: "default", name: "Default", style: "orchestral" }`, every track gets `soundtrack: "default"` and `style: "orchestral"`. Choice: keep the migration only while it fits in a few lines; if validation order forces branches, drop v2 and note it in `docs/contracts.md`, because a growing compat shim costs more than the one placeholder manifest it serves.

Version 3 rejects with the track id named: unknown soundtrack id, track style different from its soundtrack style, duplicate track ids, duplicate soundtrack ids, empty soundtrack id, empty or non-lowercase style slug. A soundtrack with no tracks is allowed with no warning, since a half built drop-in should still parse.

`public/music/manifest.json` becomes v3 with one soundtrack `placeholder-musicgen` (name "MusicGen placeholder", style `orchestral`, credit noting MusicGen placeholder output, CC-BY-NC-4.0). Both clips belong to it with `style: "orchestral"`.

## Selection state and scheduler threading

New domain types in `core/music.ts`:

```ts
export interface MusicSelection { mode: "soundtrack" | "random"; soundtrackId: string | null; style: string | null; }
export type Rng = () => number;
export interface SelectEnv { selection: MusicSelection; rng: Rng; }
```

`MusicSelection` models the session, not the scene: style is fixed for the session, `soundtrackId` is the session home in soundtrack mode, mode picks the ranking rule. Choice: one struct instead of separate booleans so an invalid mix (random plus a home soundtrack that matters) cannot be built.

Default style is the style of the first soundtrack in manifest order that has tracks, unless a persisted soundtrack id is valid; then its style wins. `resolveSessionStyle(manifest, persistedId)` returns it, null when the manifest holds no tracks.

Threading decision: the scheduler entry points take the selection and rng as one trailing `env: SelectEnv` argument, and a pure `candidatesFor(selection, manifest)` helper does the style filter inside core. Choice: env object over more positional args so the six call sites stay uniform when later work adds inputs. All functions stay pure with explicit `nowSec`; core never calls `Math.random`.

Exact exported signatures:

```ts
export function candidatesFor(selection: MusicSelection, manifest: MusicManifest): Track[];
export function resolveSessionStyle(manifest: MusicManifest, persistedId: string | null): string | null;
export function nextSoundtrack(selection: MusicSelection, manifest: MusicManifest, emotion: EmotionId | null): Soundtrack | null;
export function pickRandomTrack(cands: Track[], scene: SceneSignal | null, excludeId: string | null, rng: Rng, override?: Partial<MusicConfig>): Track | null;
```

Scheduler in `core/music-schedule.ts`:

```ts
export interface ScheduleDecision { state: SchedulerState; switchToId: string | null; crossfadeSec: number; hardCut: boolean; fallback: boolean; }
export function observeScene(state, sceneId, signal, manifest, nowSec, env: SelectEnv, override?: Partial<MusicConfig>): ScheduleDecision;
export function tickScheduler(state, signal, manifest, nowSec, env: SelectEnv, override?: Partial<MusicConfig>): ScheduleDecision;
export function requestNext(state, signal, manifest, nowSec, env: SelectEnv, override?: Partial<MusicConfig>): ScheduleDecision;
export function requestSoundtrackChange(state, signal, manifest, nowSec, env: SelectEnv, override?: Partial<MusicConfig>): ScheduleDecision;
export function noteTrackEnded(state, signal, manifest, endedId, nowSec, env: SelectEnv, override?: Partial<MusicConfig>): ScheduleDecision;
```

Ranking change inside the scheduler: every pick first reduces the manifest through `candidatesFor` (same style only), then applies the existing scoring, hysteresis, dwell, min track time, hard cut and crossfade config. `nextTrack` keeps its signature for the null scene path but otherwise runs on the filtered set; the scheduler passes the filtered manifest down. Choice: filter at the scheduler boundary instead of inside `rankTracks` so scoring stays style blind and testable on plain lists.

`fallback` is true only when the picked track sits outside the session soundtrack. It resets on every decision that picks no track or picks inside.

## Soundtrack mode and per-scene fallback

In `soundtrack` mode (default), each scene considers only tracks of `selection.soundtrackId`, scored and gated exactly as today.

When that soundtrack holds no track hand-labeled with the scene dominant emotion, the scheduler falls back for that scene only: best same-style track from any soundtrack with that emotion, else best same-style track overall. The session soundtrack does not change and the decision sets `fallback: true` so the bar can say so.

"Cambiar track" (existing Next): same-emotion tracks inside the current soundtrack in score order, wrapping, skipping current. If none, same emotion in other same-style soundtracks. Then best same-style overall excluding current. Null scene cycles the style set in id order.

## Change soundtrack algorithm

`requestSoundtrackChange` runs at once on user press, with no dwell and no min-track rule:

1. Read the dominant emotion of the current scene signal, or null when the scene is null.
2. List soundtracks in stable manifest order, same style, with at least one track, excluding the session soundtrack.
3. With a non-null emotion, drop soundtracks with no track of that emotion. With a null scene, keep any soundtrack with any track.
4. Take the first survivor after the current soundtrack in manifest order, wrapping to the start. None survivor means return null with state unchanged, and the UI disables the button.
5. Pick that soundtrack's best match for the scene (score order, current config), switch with `crossfadeSec`, set the override like Next, and store the new soundtrack as the session soundtrack so later scenes stay there.

## Random mode algorithm

Mode `random`, on each scheduled select (observe promotion or tick release, never on render):

1. Start from same-style tracks across all soundtracks.
2. Keep those whose hand-labeled emotion equals the dominant emotion. If none, keep the whole same-style set.
3. Score the kept set, take the best score, keep tracks within `randomTolerance` of it.
4. If the current track is in the kept set, keep it (no churn on rescans).
5. Else drop the immediately previous track id when an alternative exists, and draw uniformly with the injected rng.

`MUSIC_CONFIG` gains `randomTolerance: 0.05`. Why one line: 0.05 admits near ties into the draw without letting clearly worse matches in.

Dwell and min-track rules still apply in random mode. The hysteresis margin does not apply, since any eligible draw is acceptable by construction.

Toggling random off returns to `soundtrack` mode with the soundtrack of the currently playing track, or the previous session soundtrack when nothing plays yet.

## RNG injection

Core takes `rng: () => number` through `SelectEnv` and never calls `Math.random` itself. The reader passes `Math.random` as the default at the single call site that builds the env. Tests pass a seeded stub. Choice: a bare function type over an object wrapper because nothing here needs more than one draw source.

## Persistence on the app side

New small helper `app/music-prefs.ts`:

```ts
export function loadMusicPrefs(): { mode: "soundtrack" | "random"; soundtrackId: string | null; };
export function saveMusicPrefs(prefs: { mode: "soundtrack" | "random"; soundtrackId: string | null; }): void;
```

Key `lectoria.music.v1`. Both functions wrap storage access in try/catch and fall back to defaults on any exception, so private mode never breaks playback. On load the reader ignores a stored id that is missing from the manifest or outside the session style. Only `{ mode, soundtrackId }` persists; style re-derives from the manifest each load so a manifest edit cannot strand the session in a dead style.

## Player UI changes and file split

The bar shows the soundtrack name next to title, emotion, composer or artist, license and link. When `isFallback` is true it adds a short quiet note, "de otra banda sonora".

New props on `Player`: `soundtrackName: string | null`, `isFallback: boolean`, `canChangeSoundtrack: boolean`, `onChangeSoundtrack: () => void`, `randomOn: boolean`, `onToggleRandom: () => void`. Buttons read "Cambiar track" (existing), "Cambiar banda sonora" (disabled when nothing qualifies), "Aleatoria" with `aria-pressed`. All copy in Spanish, short, sentence case. Real buttons with labels, visible focus, keyboard usable. Tokens only, Meta blue accent, never purple, no gradients, motion under 200 ms except audio fades.

File split: `app/player.tsx` keeps the audio engine and bar layout; new `app/player-controls.tsx` holds the three buttons; new `app/music-prefs.ts` holds storage. Choice: split by churn, not by layer, because `player.tsx` sits near the size hook limit and the buttons plus prefs are the parts this task edits most.

## Test list

Vitest in core, no real timers, seeded rng:

- Parse: v3 good manifest passes; unknown soundtrack id, style mismatch, duplicate track ids, duplicate soundtrack ids each throw naming the track; v2 migrates to one implicit soundtrack; soundtrack without tracks parses.
- Soundtrack mode: selection stays inside the soundtrack across scenes with different emotions.
- Fallback: soundtrack missing the emotion falls back for that scene, session soundtrack unchanged, `fallback` true, next in-emotion scene returns inside with `fallback` false.
- Next: cycles inside the soundtrack first, then same emotion in other same-style soundtracks, then best same-style overall.
- Change soundtrack: cycles in manifest order, skips soundtracks without the emotion, stays for later scenes, returns null with state unchanged when none qualifies, null scene moves to the next same-style soundtrack with any track.
- Random: picks only matching emotion and style within tolerance, avoids the immediate repeat when an alternative exists, keeps the current track when eligible, deterministic under a seeded rng.
- Toggle off adopts the playing track's soundtrack.
- Style isolation: fixture with an `electronic` soundtrack that is never picked while style is orchestral.
- Persistence helper: invalid stored ids fall back to defaults, storage exceptions return defaults.
- Existing committed-manifest test keeps passing with every `src` present.

Fixture: two orchestral soundtracks with overlapping emotions (one missing an emotion) plus one electronic soundtrack.

Docs: update `docs/contracts.md` (manifest v3, soundtracks, style rule, selection modes, Next and change rules, random mode, persistence) and `public/music/README.md` (add a `soundtracks` entry, set `soundtrack` and `style` per track, one style per soundtrack, no code change). Add a row to `BUILT_DURING_HACKATHON.md` like task 5. Sentence-case headings, no em dashes, short.

## Prove it works

Run and report: `npm test`, `npm run typecheck`, `npm run build`, `npm run test:hooks`, `npm run check:size`, `node scripts/check-secrets.mjs --all`, and `gitleaks dir . --redact --no-banner` when available. Start `npm run start` on a free port, curl `/` and `/music/manifest.json`, confirm the manifest parses as v3, stop the server. No Modal, no audio generation. No commit, no push.

## Risks

- Style derivation on a manifest whose first soundtrack has no tracks must skip to the first one with tracks, else the session starts empty.
- A persisted soundtrack id from an older manifest must never strand playback; the ignore rule above covers it, but the reader still needs a test for store versus manifest drift.
- "Cambiar banda sonora" disabled state depends on the current scene emotion, so the reader must recompute it per scene, not once per manifest.
- Random mode plus `minTrackSec` can feel stuck when tolerance admits one track only; that is correct behavior, not a bug, since emotion match outranks variety.
- `app/player.tsx` size: if the props and note still push it over the hook limit, move the track line rendering into the controls component too.

## Owner change

Martin simplified the UI to two controls, and this section overrides the design above where they differ. There is one `Cambiar track` button and one `Mezclar bandas` toggle (`aria-pressed`, off by default). There is no `Cambiar banda sonora` button, no `requestSoundtrackChange`, and no `nextSoundtrack`. The initial soundtrack is the one with the best emotion coverage, ties by lower id. Style is the user's choice through a selector, persisted with the session, and `requestStyleChange` moves the session to the best-coverage soundtrack of the new style without ever crossing styles.

## Owner addition: Just play Chopin

Martin asked for a `Just play Chopin` button in the player. It switches to a fixed playlist mode that ignores scene emotions and plays an ordered playlist straight through with crossfades: the four Ballades, Op. 23, 38, 47, 52, back to back, then loop to the first. Turning it off resumes normal emotion mode with a crossfade to the best match for the current scene.

Manifest v3 gains optional top-level `playlists`. A track gains optional `playlistOnly`, default false. Playlist tracks still carry `soundtrack`, `style`, and the required fields, but emotion selection never returns them: the filter lives in `candidatesFor`, not in each caller. Entering switches at once with `crossfadeSec` to the first entry. Scene changes stay tracked but never switch. Track end and `Cambiar track` advance in `trackIds` order with wrap. Exiting clears playlist state and picks the best match under the restored selection. The mode is never persisted. The button shows the playlist `label` verbatim, hides when the `just-play-chopin` playlist is missing or empty, and disables mix and style controls while on. The bar keeps title, credits, soundtrack, license, and attribution, and hides the emotion label and fallback note. The committed manifest has no playlist yet, so the button stays hidden until the Chopin files land.

## Fix pass

Applied all 8 findings from `docs/reviews/06.md` without touching the rescue guard in `app/player.tsx`. The mix toggle now shares the pressed accent rule, a one-track playlist re-cues on wrap, the stale contracts section is gone, mix-off and style-change transitions live in `app/music-transitions.ts` with tests in `app/music-transitions.test.ts`, the doubled comment is deleted, one coverage helper serves both call sites, `switchStyle` returns no change during a playlist, and the music README names the empty-style rule.
Round 2: same-id switches bump a replay nonce the player effect depends on without touching the rescue guard, `requestStyleChange` calls the shared coverage helper, and style changes rank inside the picked soundtrack first with style-wide best only as fallback.
