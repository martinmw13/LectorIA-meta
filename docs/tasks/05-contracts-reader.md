# Design: task 5 contracts and scene reader

Goal: define module contracts so music generation never blocks the reader, then build the scene reader with two placeholder tracks. Real tracks drop in later by replacing files only. Branch `contracts-reader`. Binding inputs: AGENTS.md, SECURITY.md, `core/types.ts`, `core/cluster.ts`, `next.config.ts`, `data/books/oz/music-clusters.json`. This step writes only this doc. The implementer writes `docs/contracts.md`, `core/music.ts`, the manifest, the reader, and the tests.

## Module layout

```text
core/
  types.ts    existing book, scene, emotion shapes plus new contract types
  music.ts    MusicManifest, Track, parseManifest, selectTrack, nextAlternative
  reader.ts   ReaderModel, buildReaderModel
  cluster.ts  unchanged, lends buildFeatures to music.ts
server/
  books.ts    server-only loader: reads oz json, returns Book plus scenes
app/
  page.tsx    server component: loads data, builds model, renders text
  reader.tsx  client container: observer, selection, override, manifest fetch
  player/     client player: audio elements, controls, crossfade
  tokens.css  unchanged unless a player style needs a token
public/music/
  manifest.json   placeholder manifest, version 1
  README.md       swap guide plus CC-BY-NC note
  placeholder/    two mp3 clips, already present
```

Ownership: `core` is pure and owns every shared type plus selection and model building. `server` owns file reads and env. `app` owns rendering and playback. Import direction is `core <- server` and `core <- app`. Neither `server` nor client components import each other. `app/page.tsx` may import `server/books.ts`. Client files never do.

## Core types and signatures

New file `core/music.ts`. It reuses `Vector8`, `EMOTIONS`, `FEATURE_WEIGHTS`, and `buildFeatures` from `core/types.ts` and `core/cluster.ts`. Choice: reuse `buildFeatures` in place because `cluster.ts` imports only types, so client code gains no Node or heavy code.

```ts
export interface Track {
  id: string; src: string; label: string;
  vector: Vector8; intensity: number; tempo: number;
  durationSec: number; loop: boolean;
}
export interface MusicManifest { version: number; tracks: Track[]; }
export function parseManifest(json: unknown): MusicManifest;
export function selectTrack(
  scene: { vector: Vector8; intensity: number; tempo: number } | null,
  manifest: MusicManifest,
  currentTrackId?: string | null,
  opts?: { margin?: number; exclude?: string[] },
): Track | null;
export function nextAlternative(
  scene: { vector: Vector8; intensity: number; tempo: number } | null,
  manifest: MusicManifest,
  currentTrackId: string | null,
): Track | null;
```

Rules from the spec: `parseManifest` throws on unknown version, missing fields, a vector not over the 8 ids, numbers outside 0..1, or a `src` that is not a `/music/` relative path or https URL. `selectTrack` scores cosine similarity over `buildFeatures` output, keeps the current track unless the best beats it by `margin` (default 0.05), returns null for a null scene with no current track, returns null for an empty manifest, and breaks ties by manifest order. `nextAlternative` ranks by similarity after the current track and wraps around, so repeats cycle all tracks; one track returns itself. When `scene` is null it ranks on the current track first, which keeps playback stable through failed scenes.

Contract-only types live in `core/types.ts`, with no routes and no implementations:

```ts
export interface ImageRequest { bookId: string; textVersion: string; firstN: number; lastN: number; }
export interface ImageResponse { url: string; }
export interface ChatRequest { bookId: string; textVersion: string; positionN: number; spoilerMode: boolean; messages: { role: "user" | "assistant"; text: string }[]; }
```

Quota and budget stay server-only: integer micro-dollars, Redis `INCRBY` reserve before each model call, `DECRBY` refund after. Clients never see keys or raw errors. Image cache key is `firstN..lastN` plus `textVersion` plus `promptVersion` at a deterministic Blob path checked with `head()`; routes return URLs, never bytes.

## Reader model shape

New pure function in `core/reader.ts`:

```ts
export interface ReaderParagraph { id: string; n: number; text: string; }
export interface ReaderScene {
  id: string; title: string;
  emotion: { vector: Vector8; intensity: number; tempo: number } | null;
  paragraphs: ReaderParagraph[];
}
export interface ReaderChapter { ch: number; title: string; scenes: ReaderScene[]; }
export interface ReaderModel {
  bookId: string; textVersion: string; title: string; author: string;
  chapters: ReaderChapter[];
}
export function buildReaderModel(
  book: Pick<Book, "id" | "title" | "author" | "chapters" | "paragraphs" | "textVersion">,
  analysis: { scenes: AnalyzedScene[] },
): ReaderModel;
```

It joins paragraphs to scenes by `n` ranges in reading order, keeps `final` emotion or null for failed scenes, and drops analysis internals (`jev`, `muse_override`, provenance) so they never reach the client. It throws on unordered scenes or on paragraphs covered zero or two times, reusing the checks in `core/scenes.ts` where they fit.

## Server side

`server/books.ts` starts with `import 'server-only'` and exposes one function:

```ts
export function loadOzBook(): { book: Book; scenes: AnalyzedScene[] };
```

It reads `data/books/oz/book.json`, `scenes.json`, and `analysis.json` with a static import (build time, no request cost) and returns typed values. `app/page.tsx` calls it, runs `buildReaderModel`, and renders chapters, scene sections, and paragraphs as server HTML. Paragraph ids reuse `paragraphId` from `core/ids.ts`, which yields `c12p34` style ids. Choice: text renders on the server and only scene ids plus emotion triples pass as props to client components, so the full book text never duplicates in the client payload.

## App side

`app/page.tsx` owns layout: centered book column at the reading measure, quiet side panel with the "Chat comes later." placeholder, and the player bar slot. No chat code. Scene sections carry `data-scene-id` with a subtle divider and no other chrome.

`app/reader.tsx` is the client container. It owns the manifest fetch (once, from `/music/manifest.json`, parsed with `parseManifest`), the active scene id, the current track id, and the skip override. On manifest failure the reader still renders and the bar shows a short neutral message. It passes the chosen track to the player.

`app/player/` owns only playback: audio elements, play state, volume, and the skip button wired through an `onSkip` prop from the container.

## Active scene tracking

One `IntersectionObserver` watches scene sections. The reading line sits near the top third of the viewport, set with a `rootMargin` band around minus 30 percent. The active scene is the intersecting section whose top edge is nearest above the line. Choice: observer with a band instead of scroll math because jumps and fast scrolls then resolve in one callback with no position cache to maintain. Edge handling: short scenes still cross the band since sections span their paragraphs; when nothing intersects (fast fling between frames), keep the last active scene rather than guessing. On mount, compute from current scroll position so reloads mid book start on the right scene.

## Player state machine

States: `idle`, `playing`, `paused`, `crossfading`, `no music`. `idle` means no user gesture yet; `no music` means the manifest failed or is empty.

```text
idle --press play--> playing (or crossfading when a track is already selected)
playing --track change--> crossfading --1.5s--> playing
playing --press pause--> paused --press play--> playing
any --manifest failure or empty--> no music
```

Two `audio` elements fade against each other on change over about 1.5 s, then the old one pauses. `prefers-reduced-motion` sets the fade to 0. Choice: plain audio elements with a volume ramp instead of Web Audio because nothing here needs decoding or filtering, and native elements keep codec and loop behavior free. Loop is on. Audio starts only after the user presses play, which satisfies autoplay rules; track swaps before first press only change `src`. Volume slider sets both elements. UI motion stays under 200 ms per tokens; the audio fade is not UI motion. Controls are real buttons with labels, visible focus, and full keyboard use. The bar shows the track label and the active scene title.

## Selection and skip override

On each active scene change the container runs `selectTrack(sceneEmotion, manifest, currentId)` and stores the result as current. The "Change track" button calls `nextAlternative` and stores that id as the override for the current scene. While the override stands, scene rerenders reuse it without calling `selectTrack`. When the active scene changes, the override clears and selection runs again with the override track passed as `currentTrackId`, so hysteresis compares against what the user last heard. This matches the product rule that a skip holds until the next scene.

## Placeholder manifest

Choice: static `public/music/manifest.json` fetched by the client, because it needs no route, ships from the CDN, and a later swap replaces files only. `version: 1`, two tracks, `loop: true`, `durationSec: 10`:

| Track | File | Label | Emotion source |
|-------|------|-------|----------------|
| oz-test-01 | placeholder/oz-test-01-calma-t01.mp3 | Calm, flute and harp | cluster t01, intensity 0.229, tempo 0.245 |
| oz-test-02 | placeholder/oz-test-02-suspenso-t07.mp3 | Suspense, tremolo strings | cluster t07, intensity 0.530, tempo 0.539 |

Vectors copy the t01 and t07 centroids rounded to 3 decimals; both already sum to 1.000 at that rounding, and the implementer renormalizes if any edit shifts the sum. `public/music/README.md` covers the swap (replace files and manifest, keep the shape, bump version) plus the CC-BY-NC note for MusicGen output in this non-commercial demo. One test loads the committed manifest through `parseManifest` and asserts every `src` exists under `public/`.

## Test list

Vitest, beside the code, no DOM library. `core/music.test.ts`: nearest by cosine wins; hysteresis keeps current within margin and switches beyond it; null scene keeps current and returns null without one; empty manifest returns null; `exclude` skips ids; ties follow manifest order; `nextAlternative` cycles all tracks and returns the single track to itself; `parseManifest` accepts the good manifest and rejects each bad shape. `core/reader.test.ts`: reading order, scenes ordered by `n`, every paragraph exactly once, null emotion for failed scenes, no `jev` or `muse_override` fields in output. Manifest test as above. Player and observer logic that can be pure stays pure and tested; the rest is covered by `next build` plus a manual run.

## Risks

Autoplay: browsers block sound before gesture, so the player must never call play on mount or on track change while `idle`; verify by loading and confirming silence until press. Observer: `find in page` and anchor jumps can set odd scroll positions, so the mount computation plus the keep-last fallback matter more than band tuning. Page weight: the full Oz text ships as server HTML, which is the point of a reader, but keep images and the manifest out of the critical path so first paint stays text. CSP: current `media-src 'self' blob:` and `connect-src 'self'` already cover `/music/` files and the manifest fetch, so no CSP change; note that future remote https track URLs would need a `media-src` edit, and the validator allows them only for that future.

## Fix pass

Review findings 1 to 9 are fixed, 10 is now a motion state with a change
listener (visuals only, never the audio fade), and 11 went away with the
player rewrite. Manifest is version 2 with hand-labeled `emotion` per
track, `title` instead of `label`, and optional `startSec`, `loop`,
`source`, and attribution fields. `SceneEmotion` is now `SceneSignal`.
Similarity is pluggable (`bhattacharyyaSimilarity` by default,
`cosineSimilarity` kept), tuned through `MUSIC_CONFIG`. A pure scheduler
in `core/music-schedule.ts` owns dwell, hysteresis, hard cuts, and the
same-emotion Next rule; the reader calls it with wall-clock seconds.
The player uses two audio elements with equal-power `requestAnimationFrame`
fades, ref-held volume, `startSec` seeks, and internal re-looping for
long tracks. Docs follow `docs/contracts.md`.

Round 2: the skip override holds through ticks until promotion, the loop arm clears only on real track changes, first press starts once with fade 0, similarity takes config weights, loop fades follow the scheduler fade, pause freezes the fade, and ended tracks clear the override.

## Decisions where the spec was open

- Reuse `buildFeatures` from `core/cluster.ts` without moving it: the module imports only types, so it adds nothing unsuitable to the client bundle.
- Static manifest over a route: fewer moving parts and the swap stays files only.
- Observer band over scroll math: correct on jumps with no cache to maintain.
- Two audio elements with volume ramp over Web Audio: no decode code for zero audible gain.
- Hysteresis default 0.05: stops flicker between neighboring scenes while real mood shifts still switch.
- Server-rendered text with slim client props: full text reaches the reader once, without doubling in the client payload.
