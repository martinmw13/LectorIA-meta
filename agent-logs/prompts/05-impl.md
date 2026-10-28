Implementation step for task 5 (Contributor). Implement docs/tasks/05-contracts-reader.md, which follows the spec below. Branch `contracts-reader`, uncommitted working tree. Do not commit or push. Do not edit `.agents/skills/` or docs/tasks/05-contracts-reader.md. Read AGENTS.md and SECURITY.md first. Apply ponytail (full), architect, typescript-best-practices, principle-type-system-discipline, principle-prove-it-works, unslop and technical-writing. Several are user-invocable-only, so the skill tool reports them as disabled; that is expected. Read their files directly (`.agents/skills/<name>/SKILL.md`) and follow them. Do not stop to ask; proceed. The placeholder mp3 files are already in public/music/placeholder/. Do not run Modal or generate audio.

Notes beyond the design:
- The page is a static server component; prefer static JSON imports for data/books/oz so `next build` prerenders it. Pass only scene ids and emotion triples (plus scene titles) to client components; the book text renders as server HTML.
- Keep the player and reader client files small and split by concern; a pure helper for "which scene is active given section rects and the reading line" is welcome and testable.
- When finished, run `npm run dev` or `npm run build && npm run start` briefly and fetch `/` and `/music/manifest.json` with curl to prove the page renders the Oz text with `data-scene-id` sections and the manifest is served. Stop the server afterward.

Final message: files changed, the contracts in one line each, test results for every check listed in the spec, and anything skipped.

The spec:

# Task 5 spec: contracts and the scene reader with placeholder music

Repo: LectorIA-meta, branch `contracts-reader`, worktree root is the workspace. Read AGENTS.md and SECURITY.md first; they are binding (core purity, server-only, generic client errors, design palette from app/tokens.css, never purple, desktop only, writing rules).

Owner goal: music generation must not block development. Define clean contracts and module boundaries across the system so any module can be swapped. For now it is enough that the reader requests a track for a scene, gets one, and starts playing it. Real MusicGen tracks are iterated in parallel and must drop in later by replacing a manifest and audio files only, with no code change.

Skills to apply (read the files in `.agents/skills/<name>/SKILL.md`; several are user-invocable-only, so read them directly): architect, principle-foundational-thinking, principle-type-system-discipline, typescript-best-practices, ponytail (full, in AGENTS.md), ponytail-review, principle-prove-it-works, unslop, technical-writing.

## Scope

1. `docs/contracts.md` (short, unslopped, sentence-case headings, under 5000 tokens). Each module: inputs, outputs, owner side (core, server, app client, pipeline, static assets). At minimum:
   - BookData: book.json, scenes.json, analysis.json, shapes already in core/types.ts. Name which fields the reader consumes.
   - MusicLibrary manifest (shape below) and where it lives.
   - Track selection (pure core function).
   - Player (client module: input is a track or null; owns audio elements, crossfade, loop, play/pause, volume).
   - Image API, contract only: request `{ bookId, textVersion, firstN, lastN }` (paragraph ordinals of the selection), response `{ url }` (a Vercel Blob URL) or a generic error. Cache key = paragraph range of the selection's touched paragraphs + textVersion + promptVersion, deterministic Blob path, `head()` before generate, never return bytes. Same paragraph reuses the image.
   - Chat API, contract only: request `{ bookId, textVersion, positionN, spoilerMode, messages }`, streamed text response. Server builds context from the book text up to positionN (whole book when spoilerMode), book prefix first and question last for prompt caching, answers only from that text.
   - Quotas and budget boundary: server-only, integer micro-dollars, Redis INCRBY reserve before each model call, DECRBY refund; clients never see keys or raw errors.
   Types for all of this live in `core/` (pure: no env, no fs, no fetch, no node imports, no server-only). `server/` and `app/` depend only on core types. Image and chat get typed request/response types and nothing else now: no routes, no implementations.

2. Music contract in core (new file, e.g. `core/music.ts`, tests beside it):
   - `MusicManifest = { version: number; tracks: Track[] }`, `Track = { id: string; src: string; label: string; vector: Vector8; intensity: number; tempo: number; durationSec: number; loop: boolean }`. Reuse `Vector8`, `EMOTIONS`, `FEATURE_WEIGHTS` and `buildFeatures` from core/types.ts and core/cluster.ts rather than duplicating (move `buildFeatures` only if importing cluster.ts into client code would drag in something unsuitable; it should not).
   - A small pure `parseManifest(json: unknown): MusicManifest` validator (throws on bad shape: unknown version, missing fields, vector not over the 8 ids, numbers out of 0..1, src not a relative `/music/` path or https URL). The client calls it on the fetched manifest so a bad drop-in fails loudly in dev.
   - `selectTrack(scene: { vector: Vector8; intensity: number; tempo: number } | null, manifest, currentTrackId?: string | null, opts?: { margin?: number; exclude?: string[] }): Track | null`: cosine similarity over `buildFeatures` (vector plus weighted intensity and tempo). Hysteresis: keep the current track unless the best candidate beats it by `margin` (default 0.05, one-line why). A null scene (hard failure, no vector) keeps the current track; with no current track it returns null. Empty manifest returns null. Ties break by manifest order, deterministic.
   - `nextAlternative(scene, manifest, currentTrackId)`: the next best track by similarity after the current one, wrapping around, so repeated presses cycle through every track. Returns the current track when the manifest has one track.
   - Product rule: a skip overrides until the next scene. The reader keeps the override per scene; when the active scene changes, selection runs again from the override track as current.

3. Placeholder manifest. Pick the simpler option and say why in docs/contracts.md: a static `public/music/manifest.json` fetched by the client is the expected choice (no route, served from CDN, swap = replace files). Two tracks, files already copied to `public/music/placeholder/oz-test-01-calma-t01.mp3` and `public/music/placeholder/oz-test-02-suspenso-t07.mp3` (10 s each, MusicGen test clips). Vectors, intensity and tempo copied from clusters t01 and t07 in data/books/oz/music-clusters.json, rounded to 3 decimals and renormalized so each vector sums to 1. `loop: true`, `durationSec: 10`, labels plain English ("Calm, flute and harp", "Suspense, tremolo strings"). Add `public/music/README.md`: how to swap in real tracks (replace manifest.json and files, keep the shape, bump version), and the CC-BY-NC note for MusicGen output (non-commercial hackathon demo). A test loads the committed manifest through `parseManifest` and checks every src file exists under public/.

4. Reader (app/). Desktop layout: the book centered at the reading measure, a quiet companion side panel slot (keep "Chat comes later." style placeholder, no chat code), and a compact player bar.
   - A server component (app/page.tsx) reads data/books/oz/book.json, scenes.json and analysis.json at build time (static import or fs in a server-only loader under server/) and builds a compact reader model with a pure core function, e.g. `buildReaderModel(book, analysis)` → `{ bookId, textVersion, title, author, chapters: [{ ch, title, scenes: [{ id, title, emotion: {vector,intensity,tempo} | null, paragraphs: [{ id, n, text }] }] }] }` in reading order. Do not ship analysis internals (jev, muse_override, provenance) to the client. Validate ordering in the core function (scenes in n order, covering paragraphs) and test it.
   - Continuous scroll, no pagination. Chapter headings, then paragraphs grouped by scene (a `section` per scene with `data-scene-id`, paragraph ids like `c12p34` from the existing ids helper). No visible scene chrome beyond maybe a subtle divider.
   - A client component tracks the active scene with IntersectionObserver: the scene whose section crosses a reading line near the top third of the viewport. Keep it simple and correct when scrolling fast or jumping.
   - Player module (client, e.g. `app/player/`): takes the selected track; two `audio` elements with a crossfade on change (about 1.5 s; 0 when prefers-reduced-motion), loop, play/pause button (audio starts only after the user presses play, respecting autoplay rules), volume slider, a "Change track" button that calls nextAlternative and holds that override until the scene changes. Shows the current track label and the active scene title, small and quiet. Accessible: real buttons, aria-labels, visible focus, keyboard usable.
   - Fetch the manifest client-side from `/music/manifest.json` once, parse with `parseManifest`; on failure the reader still works without music and the bar shows a short neutral message.
   - Style with existing tokens in app/tokens.css; extend tokens only if needed. Meta blue `#0866FF` single accent, no purple, no gradients, no glassmorphism, no emoji icons. Motion under 200 ms for UI (the audio crossfade is not UI motion). Desktop only.
   - Keep the CSP working: audio from 'self' is allowed by `media-src 'self' blob:`; manifest fetch is `connect-src 'self'`. Do not loosen the CSP.

5. Tests (vitest, beside the code): selectTrack (nearest by cosine, hysteresis keeps current within margin and switches beyond it, null scene keeps current, empty manifest, exclude, deterministic ties), nextAlternative (cycles all tracks, single track), parseManifest (good, bad shapes), buildReaderModel (reading order, scene ordering by n, every paragraph exactly once, null emotion for failed scenes, no analysis internals), committed manifest test. Do not add a DOM testing library; player and observer logic that can be pure should be pure and tested, the rest is checked by `next build` and a manual run.

## Hard rules
- No new runtime dependencies. No new dev dependencies unless strictly needed (say why).
- Every authored file under 5000 tokens (the pre-commit hook enforces it). public/ and data/books/ are already exempt.
- No Modal, no MusicGen, no audio generation code. Do not touch any other repo.
- Update BUILT_DURING_HACKATHON.md with a 2026-10-27 row for task 5.
- Prose (docs, UI copy, README) through unslop: no filler, no hype, no em dashes, no emoji.
- Run `npm test`, `npm run typecheck` (run `npx next typegen` first if next-env.d.ts is missing), `npm run build`, `npm run test:hooks`, `npm run check:size`, `node scripts/check-secrets.mjs --all`, `~/.local/bin/gitleaks dir . --redact --no-banner`. All green.
