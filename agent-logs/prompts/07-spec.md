# Task 7 spec: Picture this and Picture scene

Repo: LectorIA-meta, branch `picture-this`, worktree root is the workspace. Read AGENTS.md, SECURITY.md and docs/contracts.md first; they are binding (core purity, `import "server-only"` in every server/ file, generic client errors, palette from app/tokens.css with Meta blue `#0866FF` as the single accent, never purple, desktop only, writing rules, Spanish UI copy).

Another task (06, music soundtracks) runs in parallel and edits `core/music*`, `app/player.tsx`, `app/reader.tsx` and `public/music/`. Do not touch those files. Put the image UI in new files and mount it from `app/page.tsx` (the `aside.companion` slot). To know the current scene, read the DOM at click time with the existing pure `pickActiveScene` from `app/active-scene.ts` (import it, do not edit it), the same way the reader snapshots `section[data-scene-id]` rects.

## Owner decisions (binding, they replace two older rules)

- Picture this cache key = book + the paragraph where the selection STARTS + `textVersion` + `promptVersion`. Never generate the same image twice for one paragraph. Update the AGENTS.md product rule that said "paragraph range" and the image section of docs/contracts.md to match.
- Picture scene cache key = book + scene id + `textVersion` + `promptVersion`.
- Images live in Vercel Blob at deterministic public paths (`addRandomSuffix: false`, `allowOverwrite: false`). An index in Upstash Redis maps key to Blob URL so hits are one Redis GET; on an index miss check the Blob path with `head()` before generating and backfill the index. Update the AGENTS.md rule that said "No Redis index".
- Prompts are built server-side only from trusted book text: the start paragraph text (clipped to about 600 chars) plus scene context (scene title and a short clip of the surrounding scene text) for Picture this; the scene title plus a clip of the scene text for Picture scene. The client sends ordinals and ids only, never free text, so there is no prompt injection path and the cached image depends only on the key. Style: W. W. Denslow's 1900 first-edition illustrations for The Wonderful Wizard of Oz: flat color, bold black ink outlines, limited palette; Dorothy wears silver shoes; nothing from the 1939 MGM film (no ruby slippers, no film look); no text, captions or lettering in the image (the spike in docs/spikes.md found unprompted captions). Prompt text in English. `PROMPT_VERSION = "v1"`.

## API

- `POST /api/images` (Node runtime, `maxDuration` 120, generation takes 30 to 40 s per docs/spikes.md). Body is a discriminated union: `{ kind: "passage", bookId, textVersion, n }` (n = ordinal of the paragraph where the selection starts) or `{ kind: "scene", bookId, textVersion, sceneId }`. Validate strictly at the boundary: known book, matching textVersion, integer n inside the book, known scene id; anything else is a 400 with a generic Spanish message.
- Responses (JSON, typed in core): `{ status: "ready", url, cached: boolean, caption }`, `{ status: "pending" }` (another request holds the lock for this key; the client polls the same POST every 3 s, up to about 2 minutes), or `{ status: "error", code, message }` where code is one of `quota`, `budget`, `unavailable`, `bad_request` and message is friendly Spanish. Never raw errors, never image bytes. Caption: scene title for scenes, the first words of the paragraph for passages, built server-side.
- Update `ImageRequest` / `ImageResponse` in core/types.ts and docs/contracts.md (the old `{ firstN, lastN }` shape goes).

## Order of operations in the route (each step a small function; pure logic in core/)

1. Parse and validate the request.
2. Derive the key (pure core function, tested): e.g. `images/oz/<textVersion>/v1/p<n>.webp` and `images/oz/<textVersion>/v1/scene-<sceneId>.webp`; the same string is the Redis index key suffix.
3. Cache lookup: Redis index GET, then Blob `head()`. A hit returns `ready` with `cached: true` and costs no quota or budget.
4. Lock: `SET lock:<key> <token> NX EX 150`. If not acquired return `pending`.
5. Quota (only for new generations): 5 new images per person per day, counted by hashed IP and by an anonymous cookie, whichever runs out first. IP hash = HMAC-SHA256 with `IP_HASH_SALT` over the IP, day keys in UTC (`YYYY-MM-DD`), keys expire after 48 h. The anonymous cookie holds a random id signed with HMAC (`SESSION_SECRET`), httpOnly, Secure, SameSite=Lax; verify with a constant-time compare; set it when missing or invalid. Use INCR on both counters; if either exceeds 5, DECR both back and return `quota`. Client IP from the first `x-forwarded-for` entry (Vercel sets it).
6. Budget: global cap from env `SPEND_CAP_USD` (default 10) in integer micro-dollars, one Redis counter shared by images and the future chat. Reserve with `INCRBY` the image cost (`IMAGE_COST_MICRO = 10000`, USD 0.01 per docs/spikes.md; shortcut comment) before the call; if the new total exceeds the cap, `DECRBY` back and return `budget`. Refund with `DECRBY` when the call fails.
7. Turnstile hook: a `verifyHuman(req)` placeholder in server/ that returns true now, called before quota, with a one-line comment that a later task wires Turnstile.
8. Generate with muse-image-1.0: `POST https://api.meta.ai/v1/images/generations`, `{ model: "muse-image-1.0", prompt, n: 1, size: "1024x1024", output_format: "webp", response_format: "b64_json" }`, bearer `META_API_KEY`, timeout about 100 s. The Meta client lives in a server-only module and is injected into the orchestration so tests mock it.
9. `put()` to Blob at the deterministic path (contentType image/webp, public, cache max-age long), SET the index, release the lock only if the token matches (compare in a small Lua `EVAL` or GET then DEL; say which and why), refund quota and budget on failure, log only a short error code server-side (no keys, no provider bodies).

If `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN`, `BLOB_READ_WRITE_TOKEN`, `META_API_KEY`, `SESSION_SECRET` or `IP_HASH_SALT` is missing, the route returns `unavailable` ("Las imágenes no están disponibles por ahora.") and never generates: no quotas or budget means no spending. Read env only in server/.

Redis: call the Upstash REST API with built-in fetch in one small server-only client (`POST <url>` with a JSON command array, bearer token; a pipeline only if it truly saves code). No new Redis dependency. Blob: add `@vercel/blob` (the only new runtime dependency; say why in the PR). Define a tiny `KV` interface in core (get, set with NX/EX, incr, incrby, decrby, expire, del-if-token) so tests use an in-memory fake.

## UI (new client component, e.g. `app/picture-panel.tsx`, styles in app/globals.css with existing tokens)

- Selecting text inside the book shows a small floating button near the selection: "Ilustrar este pasaje". The start paragraph is the `p[id]` that contains the selection's start (anchor or range start, whichever comes first in document order); its ordinal comes from a `data-n` attribute you add to each paragraph in app/page.tsx. Ignore selections outside the book.
- The companion panel has a quiet "Ilustrar escena" button for the current scene, plus the image card: the image with alt text and its caption, a loading state ("Ilustrando…" with a calm placeholder, no spinner theatrics), a subtle "Nueva" or "Guardada" note for cached state, and the friendly error message when there is one. Keep "El chat llega más adelante." as a small note below.
- Desktop only, minimalist, Meta blue accent, no purple, no gradients, no emoji, motion under 200 ms, real buttons with aria-labels and visible focus. next/image is not needed; a plain `img` is fine (the CSP already allows `*.public.blob.vercel-storage.com`).

## Tests (vitest, beside the code)

- Key derivation: passage key uses only the start paragraph, scene key, versions in the key, different books or versions give different keys.
- Request validation: good passage and scene bodies, bad kind, unknown scene, n out of range, wrong textVersion, extra junk.
- Prompt builder: uses the trusted paragraph text, clips length, contains silver shoes and the no-text rule, never MGM look.
- Quota logic with the fake KV: 5 allowed, the 6th refused, IP limit hits while cookie is fresh and vice versa, refund on refuse, day rollover.
- Budget: reserve, cap exceeded refunds and refuses, refund on failure.
- Lock: second requester gets pending, release only with the right token.
- Route orchestration with mocked Meta client, fake KV and fake Blob: hit returns cached without calling Meta or touching quota; miss generates once, stores, indexes; Meta failure refunds quota and budget, releases the lock and returns a generic message with no raw error text; missing env returns unavailable.
- Cookie signing: valid signature accepted, tampered rejected.

## Hard rules

- Spanish UI copy, through unslop. Prose in docs through unslop and technical-writing, sentence-case headings, no em dashes, no emoji.
- `META_API_KEY` and every secret only in server-only modules. Nothing secret behind `NEXT_PUBLIC_`. Add `SPEND_CAP_USD` to `.env.example` (name and comment only).
- No raw errors to clients. Logs hold no keys, tokens or provider output.
- Every authored file under 5000 tokens (the pre-commit hook enforces it).
- Do not run any real image generation; tests mock the Meta client. Do not touch any other repo. No Modal.
- Update BUILT_DURING_HACKATHON.md with a 2026-10-27 row for task 7.
- Run `npm test`, `npm run typecheck`, `npm run build`, `npm run test:hooks`, `npm run check:size`, `node scripts/check-secrets.mjs --all`, `~/.local/bin/gitleaks dir . --redact --no-banner`. All green.
