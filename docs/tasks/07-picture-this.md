# Design: task 7 picture this and picture scene

Goal: let a desktop reader illustrate the current passage or the current scene with a cached Denslow style image. Branch `picture-this`. Binding inputs: AGENTS.md, SECURITY.md, docs/contracts.md, docs/spikes.md, `core/types.ts`, `core/reader.ts`, `server/books.ts`, `app/page.tsx`, `app/active-scene.ts`, `app/reader.tsx`, `next.config.ts`. This step writes only this doc. The implementer writes the code, tests, and contract updates. Task 6 edits `core/music*`, `app/player.tsx`, `app/reader.tsx`, and `public/music/`, so this task touches none of those files.

## Scope and touch list

Touches: `core/types.ts` (replace image contract), `core/images.ts` plus `core/images.test.ts` (new, pure logic), `server/images/*` (new, env and network), `app/api/images/route.ts` (new, thin shell), `app/picture-panel.tsx` plus test (new client UI), `app/page.tsx` (add `data-n` to paragraphs, mount panel in `aside.companion`), `app/globals.css` (panel styles with existing tokens), `docs/contracts.md` (image section), AGENTS.md product rules (cache key and Redis index lines), `.env.example` (one name), `BUILT_DURING_HACKATHON.md` (one row). Does not touch music, player, reader, Blob bytes in responses, or any other repo. No Modal, no real generation in tests.

## Module layout

```text
core/
  images.ts       key derivation, validation, prompt build, caption, quota and budget helpers, lock token compare
  types.ts        discriminated ImageRequest, ImageResponse, ImageErrorCode
server/
  images/env.ts       reads env once, reports missing keys as unavailable
  images/kv.ts        Upstash REST client behind the KV interface, server-only
  images/blob.ts      head and put wrappers around @vercel/blob, server-only
  images/meta.ts      muse-image-1.0 client with timeout, server-only
  images/cookies.ts   anonymous id sign and verify, server-only
  images/quota.ts     IP hash plus cookie counters, server-only glue over KV
  images/orchestrate.ts  route order of operations, injected clients
  images/human.ts     verifyHuman placeholder, returns true
app/
  api/images/route.ts  parse body, call orchestration, map to JSON
  picture-panel.tsx    selection button, scene button, image card
  page.tsx             adds data-n, mounts panel, no other change
```

Ownership: `core` stays pure with no keys, no env reads, no fetch, no `server-only`. `server` owns every secret, env read, and network call, and each file starts with `import "server-only"`. `app` owns rendering and polling. Import direction is `core <- server` and `core <- app`. Server and client components never import each other. `app/page.tsx` may import `server/books.ts`. The client never sends text, only ordinals and ids. Choice: one function per route step in `server/images/orchestrate.ts` calling pure `core/images.ts` helpers because each step then tests without fetch or Blob.

## Core types and signatures

Old `{ firstN, lastN }` shape goes. New contract:

```ts
export type ImageKind = "passage" | "scene";
export interface PassageRequest { kind: "passage"; bookId: string; textVersion: string; n: number; }
export interface SceneRequest { kind: "scene"; bookId: string; textVersion: string; sceneId: string; }
export type ImageRequest = PassageRequest | SceneRequest;
export type ImageErrorCode = "quota" | "budget" | "unavailable" | "bad_request";
export type ImageResponse =
  | { status: "ready"; url: string; cached: boolean; caption: string }
  | { status: "pending" }
  | { status: "error"; code: ImageErrorCode; message: string };
export const PROMPT_VERSION = "v1" as const;
export const IMAGE_COST_MICRO = 10000 as const; // shortcut: USD 0.01 per spike, revisit if Meta reprices
```

Pure helpers in `core/images.ts`:

```ts
export function parseImageRequest(json: unknown): ImageRequest; // throws ImageValidationError
export function validateAgainstBook(req: ImageRequest, book: { id: string; textVersion: string; paragraphNs: Set<number>; sceneIds: Set<string> }): void;
export function imageKey(req: ImageRequest): string; // images/oz/<textVersion>/v1/p<n>.webp or scene-<sceneId>.webp
export function buildPrompt(args: { kind: ImageKind; passageText: string; sceneTitle: string; sceneClip: string }): string;
export function buildCaption(args: { kind: ImageKind; sceneTitle: string; passageText: string }): string;
export function quotaKeys(args: { day: string; ipHash: string; anonId: string }): { ip: string; anon: string };
export function overQuota(count: number): boolean; // count > 5
export function budgetExceeded(totalAfterReserve: number, capMicro: number): boolean;
export function canRelease(expected: string, actual: string | null): boolean;
```

Validation rules: known `bookId` (only `oz` now), exact `textVersion` match, integer `n` inside the book, known `sceneId`, no extra fields silently accepted, every failure a 400 with one generic Spanish string. Choice: strict reject on unknown fields because silent extra fields hide client bugs and cost money downstream.

Key derivation detail: passage key uses only the start paragraph ordinal, never the selection end, so one paragraph maps to one image and repeat taps cost nothing. Scene key uses the scene id. Both embed book id, `textVersion`, and `PROMPT_VERSION`. Same string serves as Blob path and Redis index key suffix. Choice: `webp` suffix fixed at write time because the provider returns webp and the Blob content type stays constant.

Prompt builder: input is trusted server side book text only. Passage prompt uses the start paragraph clipped to about 600 chars plus scene title and a short scene clip. Scene prompt uses scene title plus a scene text clip. Fixed English style tail names Denslow 1900 flat color with bold black ink outlines and limited palette, Dorothy in silver shoes, no MGM look, and no text, captions, or lettering in the image. Caption is server built: scene title for scenes, first words of the paragraph for passages.

## Route state machine

`POST /api/images`, Node runtime, `maxDuration` 120. One pass, no branches skipped:

```text
validate -> key -> hit -> lock -> human -> quota -> budget -> generate -> store -> index -> release
```

1. Validate: parse body with `parseImageRequest`, check against the loaded book, 400 plus generic Spanish message on any failure.
2. Key: `imageKey(req)`.
3. Hit: Redis index GET, then Blob `head()` on miss. Either hit returns `{ status: "ready", cached: true }` with no quota or budget touch.
4. Lock: `SET lock:<key> <token> NX EX 150`. Token is `crypto.randomUUID()`. Failure returns `{ status: "pending" }`.
5. Human: `verifyHuman(req)` placeholder returns true. Choice: call it before quota so the later Turnstile wiring needs no reorder.
6. Quota: only for new generations. Hashed IP plus signed anonymous cookie, each `INCR` with 48 h expiry, limit 5 per UTC day. Either counter over 5 means `DECR` both back and return `quota`.
7. Budget: `INCRBY spend <IMAGE_COST_MICRO>`, shared counter with future chat, cap from `SPEND_CAP_USD` default 10 converted to micro dollars. Over cap means `DECRBY` back and return `budget`.
8. Generate: Meta client `POST https://api.meta.ai/v1/images/generations` with `{ model: "muse-image-1.0", prompt, n: 1, size: "1024x1024", output_format: "webp", response_format: "b64_json" }`, bearer `META_API_KEY`, abort about 100 s. Spike measured 31 to 40 s, so 100 s covers a slow call inside the 120 s function cap.
9. Store: Blob `put()` at the deterministic path with `addRandomSuffix: false`, `allowOverwrite: false`, content type image/webp, long cache age. Then Redis index SET key to URL.
10. Release: delete the lock only when the token matches. Choice: Lua `EVAL` compare and delete in one round trip because GET then DEL can delete a new owner lock after expiry.
11. Refund: any failure after reserve runs `DECRBY` budget and `DECR` both quota counters, releases the lock, logs a short code only, and returns a generic Spanish message. Missing env (`UPSTASH_REDIS_REST_URL|KV_REST_API_URL`, `UPSTASH_REDIS_REST_TOKEN|KV_REST_API_TOKEN`, `BLOB_READ_WRITE_TOKEN`, `META_API_KEY`, `SESSION_SECRET`, `IP_HASH_SALT`) short circuits to `unavailable` before any counter moves; each Redis value falls back to its `KV_REST_API_*` name, and the read-only token is unused.

Quota cookie: random id signed with HMAC-SHA256 over `SESSION_SECRET`, httpOnly, Secure, SameSite=Lax, constant time verify, set when missing or invalid. Client IP is the first `x-forwarded-for` entry, stored only as HMAC-SHA256 with `IP_HASH_SALT` in day keyed counters.

## KV interface and fake

```ts
export interface KV {
  get(key: string): Promise<string | null>;
  setNxEx(key: string, value: string, exSec: number): Promise<boolean>;
  set(key: string, value: string): Promise<void>;
  incr(key: string): Promise<number>;
  incrBy(key: string, by: number): Promise<number>;
  decr(key: string): Promise<number>;
  decrBy(key: string, by: number): Promise<number>;
  expire(key: string, sec: number): Promise<void>;
  releaseIfToken(key: string, token: string): Promise<boolean>; // Lua EVAL
}
```

One server client implements it over Upstash REST with built in fetch: `POST <url>` with a JSON command array and bearer token, no new Redis dependency. Choice: single command calls, no pipeline, because the route issues few calls and a pipeline helper adds code with no measured gain. Tests use an in memory fake with a `Map` plus expiries checked against injected `now`. The Meta client and Blob wrappers are injected the same way, so orchestration tests never touch the network.

## Client polling flow and UI states

New `app/picture-panel.tsx`, styles in `app/globals.css` with existing tokens, Meta blue `#0866FF` single accent, no purple, no gradients, no emoji, motion under 200 ms with `prefers-reduced-motion` respected.

Selection flow: a `selectionchange` listener scoped to `main.book` shows a small floating button near the selection, labeled "Ilustrar este pasaje". On click the panel reads the live DOM once: the `p[id]` holding the earlier of anchor or focus in document order gives the start paragraph, and its `data-n` gives `n`. It imports the existing pure `pickActiveScene` for the scene button only and never edits `app/active-scene.ts`. Selections outside the book are ignored. Choice: read the DOM at click time instead of caching rects because cached rects go stale on scroll and each click needs one fresh read only.

Scene flow: the companion panel holds a quiet "Ilustrar escena" button for the current scene id plus the image card. Card states: empty (no request yet), loading ("Ilustrando…" with a calm placeholder block, no spinner theatrics), ready (plain `img` with alt and caption plus a subtle "Nueva" or "Guardada" note from the `cached` flag), error (friendly Spanish string only), and a small permanent note "El chat llega más adelante." Polling: on `pending` the client reposts the same body every 3 s up to about 2 minutes, then shows a neutral retry message. Choice: repost instead of a status GET because one route keeps the lock, quota, and validation logic in a single place. Plain `img` over `next/image` because the CSP already allows Blob hosts and no optimization is needed. All controls are real buttons with aria labels and visible focus.

## Test list

Vitest beside the code. `core/images.test.ts`: passage key uses start paragraph only, scene key shape, versions and book ids in the key, different books or versions differ; good passage and scene bodies pass, bad kind, unknown scene, out of range `n`, wrong `textVersion`, and extra fields fail; prompt uses trusted text, clips near 600 chars, names silver shoes and the no text rule, never MGM; captions pick title versus first words. Quota with fake KV: 5 pass, 6th refused, IP limit fires while cookie is fresh and back, refusals refund both counters, UTC day rollover resets. Budget: reserve adds cost, over cap refunds and refuses, failure refunds. Lock: second holder gets pending, release needs the token. Route orchestration with mocked Meta, fake KV, fake Blob: hit returns cached without Meta or quota moves; miss generates once, stores at the fixed path, backfills the index; Meta failure refunds quota and budget, releases the lock, returns generic text with no raw error; missing env returns `unavailable` and never generates. Cookie tests: valid signature accepted, tampered or wrong secret rejected, compare is constant time by construction. UI test asserts button labels, loading text, and cached note copy in Spanish.

## Risks

Vercel function duration: generation takes 30 to 40 s, so the route sets `maxDuration` 120 and a 100 s client timeout; mitigation is polling with `pending` rather than holding one request per client retry. Lock expiry versus slow generation: lock TTL 150 s covers one slow call but a retry storm after expiry could double generate, so `allowOverwrite: false` plus index backfill keeps the second writer from clobbering the first. Double charging on retries: each POST reserves budget once, and client retries repost, so the route must check hit and lock before quota and budget on every call and refund on every failure path including timeouts. Blob overwrite races: deterministic paths with `allowOverwrite: false` turn a race into a benign write error followed by an index backfill from `head()`. CSP: `img-src` already allows Blob hosts and `connect-src 'self'` covers the same origin POST, so no config change; remote provider URLs never reach the client. Selection edge cases: reversed selections, multi paragraph drags, and clicks outside the book; the rule is start paragraph only, outside ignored, which keeps the cache key stable and the prompt free of untrusted text.

## Contract and rule updates

`docs/contracts.md` image section: replace the range key with start paragraph key, add the scene key, add the Redis index plus `head()` fallback, replace `{ firstN, lastN }` and `{ url }` with the discriminated request and the ready, pending, and error responses. AGENTS.md product rules: replace the range key line with the start paragraph rule and the no index line with the index rule. `.env.example` gains `SPEND_CAP_USD=` with a comment only. `BUILT_DURING_HACKATHON.md` gains a 2026-10-27 row for task 7. Verification for the implementer: `npm test`, `npm run typecheck`, `npm run build`, `npm run test:hooks`, `npm run check:size`, `node scripts/check-secrets.mjs --all`, gitleaks, all green.

## Open choices decided

Strict request parsing: reject unknown fields to catch client drift before it spends budget. Single POST with repost polling: one code path for lock, quota, and validation. Lua release: atomic token compare so an expired lock cannot free a new owner. No pipeline in the KV client: fewer lines for the same call count. Plain `img`: no optimizer config for remote Blob hosts.
