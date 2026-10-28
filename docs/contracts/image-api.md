## Image api

`POST /api/images` (Node runtime, `maxDuration` 120). Request is a
discriminated union: `{ kind: "passage", bookId, textVersion, n }` names
the paragraph where the selection starts, `{ kind: "scene", bookId,
textVersion, sceneId }` names the scene. Validation is strict: known
book, matching `textVersion`, integer `n` inside the book, known
`sceneId`. Any other body is a 400 with a generic English message.
The client sends ordinals and ids only, never text. "Illustrate
scene" uses the scene id from the route. Requests may carry an
optional `style` field, see [Image style](image-style.md); styled keys
add a style segment while default keys stay unchanged.

Responses (typed in `core/types.ts`): `{ status: "ready", url, cached,
caption }` with a Vercel Blob URL, never bytes; `{ status: "pending" }`
when another request holds the lock, so the client reposts
every 3 s up to ~2 minutes; `{ status: "error", code, message }`
where code is `quota`, `budget`, `daily_budget`, `unavailable`, or
`bad_request` with a friendly English message. Both `budget` and
`daily_budget` answer `MSG_CREDITS_OUT` (`core/images.ts`): the free
credits ran out, bring your own key, and meanwhile the Oz reader is
ready with its soundtrack and illustrations. It never says "come back
tomorrow". The UI links the Oz sentence via `CREDITS_OUT_LIBRARY_HREF`
(`"/"`). Caption is the scene title, or the paragraph's first words,
built server-side.

The passage cache key is book plus start paragraph plus `textVersion`
plus `PROMPT_VERSION` (`v1`); the scene key swaps in the scene id.
Both map to a deterministic Blob path (`addRandomSuffix: false`,
`allowOverwrite: false`). An Upstash Redis index maps key to Blob URL,
so hits are one GET; on an index miss the server lists by path prefix
before generating and backfills the index.
Quota is 5 new images per person per day by hashed IP and signed
cookie, whichever runs out first; a shared spend counter in integer
micro-dollars sits under `SPEND_CAP_USD` (default 10), plus a daily
counter per UTC day under `DAILY_SPEND_CAP_USD` (default 2, 48 h key
TTL). Failures refund quota and both counters and release the lock.
Both caps apply only to requests paid with our key; a future
bring-your-own-key path skips them. Free uploads allow one book per
person (`FREE_BOOKS_PER_PERSON` = 1, hashed IP plus anon cookie, no
day, ~10-day TTL; `checkBookQuota`/`refundBookQuota` in
`server/images/quota.ts`, no route yet).

