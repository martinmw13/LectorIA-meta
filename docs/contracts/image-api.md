## Image api

`POST /api/images` (Node runtime, `maxDuration` 120). Request is a
discriminated union: `{ kind: "passage", bookId, textVersion, n, endN? }`
names the first and last paragraph of the selection (`endN` omitted for
a one-paragraph selection), `{ kind: "scene", bookId,
textVersion, sceneId }` names the scene, and `{ kind: "chapter", bookId,
textVersion, ch, reachedCh }` asks for one chapter's comic page (Panels).
`reachedCh` is the furthest chapter the reader has reached; the server
refuses `ch > reachedCh` with a 400. There is no server-side reading
position, so this is the client's claim: it keeps the shipped UI and
casual direct calls from drawing or showing later chapters, not a
determined client. `reachedCh` is not part of the cache key. Validation is strict: known
book, matching `textVersion`, integer `n` inside the book, optional
integer `endN >= n` inside the book, known `sceneId`. The server clamps
`endN` to the end of the scene that holds `n`. Any other body is a 400 with a generic English message.
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
credits ran out, bring your own key, and meanwhile your book is
ready to read, with its soundtrack and illustrations. It never says
"come back tomorrow". The UI links home via `CREDITS_OUT_LIBRARY_HREF`
(`"/"`). Caption is the scene title, or the paragraph's first words,
built server-side.

The cache key is the Blob path
`images/{bookId}/{textVersion}/v4/{file}`, where `{file}` is
`p{n}.webp` for one paragraph, `p{n}-{endN}.webp` for a range,
`scene-{sceneId}.webp` for a scene, and `chapter-{ch}-c4.webp`
for a chapter page. The `v4` directory is `PROMPT_VERSION`; the
chapter file name also carries `CHAPTER_PROMPT_VERSION` (`c4`).

Overlapping selections share a picture. Each cached passage range is
recorded in a small per-scene list in Upstash (`img:ranges:` plus the
key base and scene id, newest 24 kept, `MAX_RANGES_PER_SCENE` in
`core/image-ranges.ts`). On an exact-key miss the server reuses the
cached range with the highest Jaccard similarity over paragraphs,
`|A∩B| / |A∪B|`, if it is at least `REUSE_JACCARD` = 1/3. So one
paragraph grown by one paragraph above and below (`[5]` vs `[4,6]`,
1/3), a selection moved or grown by a paragraph, or two paragraphs
against four (`[16,17]` vs `[16,19]`, 1/2) reuse the picture; one
paragraph against five or more (`[5]` vs `[3,7]`, 1/5), a whole scene
against one of its paragraphs, or any disjoint range gets its own
picture. Paragraph count beat a character-weighted overlap on real Oz
selections: short lines of dialogue next to a long paragraph sank the
character score for selections that one picture still depicts.
A reuse is a cache hit: instant, no lock, no quota, no spend.
A new range takes the lock on its own key, generates, and joins the
list. The list is GET+SET, so a concurrent append can be lost; that
only costs a future reuse.

Both kinds map to a deterministic Blob path (`addRandomSuffix: false`,
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

