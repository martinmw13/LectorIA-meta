Feature in this Next.js/TypeScript repo (Node 22, vitest). Do NOT run git commit. Edit ONLY these files: core/image-ranges.ts (new), core/image-ranges.test.ts (new), core/types.ts, core/images.ts, core/images.test.ts, server/images/handler.ts, server/images/handler.test.ts, server/images/orchestrate.ts, server/images/orchestrate.test.ts, app/folio/use-pictures.ts. Keep every diff minimal, comments short (why only), in the existing style. Each file must stay under ~5000 tokens (a pre-commit hook rejects bigger staged files), which is why the new pure logic goes in its own file. core/ stays pure (no env, no network, no server-only).

GOAL. "Picture this" (kind "passage") today caches by book + the paragraph where the selection starts (+ textVersion + PROMPT_VERSION + optional style). Owner rule: if a new selection shares paragraphs with an already cached selection, reuse that image; if they are very different in size (one covers much more text), generate a new one. "Picture scene" (kind "scene") stays exactly as it is.

1. core/types.ts: PassageRequest gains optional `endN?: number` (inclusive last paragraph ordinal of the selection). Update the contract comment above ImageKind in one line.

2. core/images.ts:
   - parseImageRequest: passage accepts optional `endN` (integer) alongside the optional style; keys allowed = bookId,kind,n,textVersion plus any of endN/style. Reject non-integer endN. Only include endN in the result when present.
   - validateAgainstBook: if endN present, it must be >= n and in book.paragraphNs.
   - imageKey: passage file name stays `p${n}.webp` when endN is absent or equals n (byte-identical to today, so old cached images keep hitting); otherwise `p${n}-${endN}.webp`.

3. core/image-ranges.ts (new, pure):
     export interface ParaRange { start: number; end: number } // inclusive paragraph ordinals
     export const REUSE_JACCARD = 0.5; // comment: reuse a cached picture when |A∩B|/|A∪B| over paragraphs is at least this; a much larger or smaller selection falls below and gets its own picture
     export const MAX_RANGES_PER_SCENE = 24; // bounds the per-scene lookup
     export function jaccard(a: ParaRange, b: ParaRange): number  // integer ordinals, contiguous ranges: inter = max(0, min(ends)-max(starts)+1), union = lenA+lenB-inter
     export function pickReusable(cached: readonly ParaRange[], want: ParaRange): ParaRange | null // highest jaccard >= REUSE_JACCARD; ties -> the one listed first; null when none
     export function parseRanges(raw: string | null): ParaRange[] // JSON array of {start,end}; anything malformed (bad JSON, non-integers, end<start) is dropped, never throws
     export function addRange(list: readonly ParaRange[], r: ParaRange): ParaRange[] // no duplicates, append, keep only the newest MAX_RANGES_PER_SCENE
     export function rangeListKeyFor(req: PassageRequest, sceneId: string): string // `img:ranges:` + the same base as imageKey (book/textVersion/PROMPT_VERSION, plus style segment when styled) + `/${sceneId}`. Build it from imageKey's directory (strip the file name) so the two never drift.

4. core/image-ranges.test.ts: cases for jaccard and pickReusable:
   - same paragraph [5,5] vs [5,5] -> 1, reused
   - slight extension: [10,13] vs [10,14] (0.8) and [9,13] (0.8) reused; [5,5] vs [5,6] = 0.5 reused (threshold inclusive)
   - much larger: [5,5] vs [3,9] (1/7) -> new; [10,11] vs [10,20] -> new
   - disjoint [1,2] vs [4,6] -> 0, null
   - picks the best of several overlapping candidates
   - parseRanges drops garbage; addRange dedupes and caps at MAX_RANGES_PER_SCENE
   - rangeListKeyFor differs by style and scene

5. server/images/orchestrate.ts: OrchestrateDeps gains `sceneId: string` (the scene holding the selection start; "" when unknown). For kind "passage" only, AFTER the exact-key index hit and BEFORE the exact-key Blob findUrl:
   - want = { start: req.n, end: req.endN ?? req.n }
   - list = parseRanges(await kv.get(rangeListKeyFor(req, deps.sceneId))) (skip all of this when sceneId is "")
   - best = pickReusable(list without want itself, want). If best: url = kv.get(indexKeyFor(imageKey({...req, n: best.start, endN: best.end}))); if null, try store.findUrl of that key (and backfill its index). If a url is found return { status: "ready", url, cached: true, caption } — no lock, no quota, no spend. If not found, fall through.
   - Whenever this request ends up with an image under its own exact key (exact Blob backfill, successful generation, or the lost-save-race backfill), record `want` in the list: best-effort `kv.set(listKey, JSON.stringify(addRange(list, want)))` wrapped in try/catch that only logs "image range index failed". Add a one-line `shortcut:` comment: GET+SET can drop a concurrent append, which only costs a future reuse; upgrade to a Redis list if that matters.
   - The lock stays keyed on the request's own exact key (lockKeyFor(imageKey(req))). Everything else (quota, budget, refunds, release) unchanged. Scene requests skip all range logic.
   Keep the function readable; a small local helper for "record range" is fine.

6. server/images/handler.ts: for passage requests, clamp endN to the end of the start paragraph's scene (`Math.min(parsed.endN, sceneOf.end_n)`; drop endN when it equals n), pass `sceneId: sceneOf?.id ?? ""` to orchestrate, and build passageText from all paragraphs n..endN joined with a space (buildPrompt already clips to MAX_PASSAGE_CHARS). Scene requests pass sceneId too (unused).

7. app/folio/use-pictures.ts: requestFigure takes endN too and sends `endN` in the passage body only when endN > startN; illustratePassage and retryFigure pass the figure's endN (figures already store endN).

8. Tests:
   - core/images.test.ts: parse accepts endN, rejects non-integer endN and unknown keys; validate rejects endN < n; imageKey unchanged without endN or endN===n, `p3-5.webp` with endN 5.
   - server/images/orchestrate.test.ts (memory KV, fake store/generator already there; add sceneId:"s1" to deps()): a [3,4] request after a cached [3,3] (or [3,5] after [3,4], whichever exercises it) reuses the image with cached:true, generate called once total, spend unchanged; a much larger [3,12] after [3,3] generates a new image under p3-12.webp; disjoint range in same scene generates; same range in a different scene id does not reuse; the range list never exceeds MAX_RANGES_PER_SCENE; two concurrent identical new-range requests -> one generates, other gets pending.
   - server/images/handler.test.ts: only fix what breaks; add one test that endN past the scene end is clamped if easy with the existing harness (skip if the harness cannot reach it).
   No real network, Meta, Blob or Redis anywhere in tests.

When done run: npx vitest run core server app/folio && npm run typecheck, fix failures. Report a short diff summary.
