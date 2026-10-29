Three small changes in this Next.js/TypeScript repo (Node 22, vitest). Do NOT run git commit. Keep the diff minimal, comments short and in the existing style. Do NOT touch server/images/handler.ts, server/guard/*, quota or spend code, CSS, or docs. Every file must stay under the repo's 5,000-token size limit (npm run check:size).

## 1. Picture-this reuse threshold: 1/3

core/image-ranges.ts: change `REUSE_JACCARD` from 0.5 to `1 / 3`. Update its comment: a selection that extends a cached one by a paragraph above and below ([5] vs [4,6]) shares a picture; one covering three times the text or more gets its own. Make sure the comparison in pickReusable treats exactly 1/3 as a reuse (use a float-safe check, e.g. compare `inter * 3 >= union` or keep `>=` against the same `1 / 3` expression, and test it).
core/image-ranges.test.ts: add or adjust cases: [5] vs [4,6] reuses (exactly 1/3); [5] vs [5,6] reuses; [3,4] vs [3,12] does not (0.2); [5] vs [3,7] does not (0.2); [16,17] vs [16,19] reuses (0.5); disjoint does not. Update any existing test that assumed 0.5 was the cutoff (grep core/ and server/images/ tests for 0.5 or REUSE_JACCARD). In server/images/orchestrate.test.ts add one test: cached [9] then a request for [8,10] in the same scene is a free cache hit with the [9] url (no generate, no lock, no spend), following the existing "orchestrate range reuse" tests.

## 2. Chapter panels: server-side chapter lock

Today the client hides panels for chapters the reader has not reached (`reached={panelsCh <= maxReached}` in app/leer/book-view.tsx) but the server would generate any chapter. There is no server-side reading position, so the client must state how far it has read and the server refuses anything past it.

- core/types.ts: the chapter request gains a required `reachedCh: number` (the furthest chapter the reader has reached). Comment: client-claimed, so it stops casual spoilers and direct pre-generation of later chapters, not a determined client.
- core/images.ts parseImageRequest, chapter branch: the allowed key sets become "bookId,ch,kind,reachedCh,textVersion" and "bookId,ch,kind,reachedCh,style,textVersion"; `reachedCh` must be an integer >= 1. validateAgainstBook: for chapter requests, `reachedCh` must be a known chapter and `ch <= reachedCh`, else throw ImageValidationError (the handler already maps that to 400 bad_request). imageKey and everything else must ignore `reachedCh` (same key as before, cache shared across readers). Check scripts/pregen-chapters.ts and any other caller that builds a chapter request type still typechecks (add `reachedCh: ch` where a literal is needed only if the type requires it, or use a key-only type; keep it minimal).
- app/folio/use-chapter-page.ts: replace the `reached: boolean` arg with `reachedCh: number`; compute `const reached = ch <= reachedCh;` and send `reachedCh` in the poll body. app/folio/panels-modal.tsx: same prop rename (`reachedCh: number`, derive reached the same way where it is used). app/leer/book-view.tsx: pass `reachedCh={maxReached}`.
- Tests: core/images-chapter.test.ts (and core/images.test.ts / server/images/chapter.test.ts where chapter bodies are built): add reachedCh to valid bodies; new cases: missing reachedCh -> parse throws; non-integer reachedCh throws; ch 3 with reachedCh 2 -> validateAgainstBook throws; ch 2 with reachedCh 3 passes; unknown reachedCh chapter throws; imageKey identical for reachedCh 2 and 5. In server/images/chapter.test.ts add one handler-level test that a chapter beyond reachedCh gets 400 bad_request and never calls generate. Update app/folio/panels-modal.test.tsx for the prop rename and assert the request body carries reachedCh.

## 3. Panels wait copy

Comic-page generation takes about 38 s, so the panels modal note should not say twenty seconds.
- app/folio/picture-draw-paths.ts: add `export const PANELS_NOTE = "Ready in about half a minute";` next to DRAW_NOTE (leave DRAW_NOTE unchanged for single pictures).
- app/folio/picture-draw.tsx: PictureWait takes an optional `note?: string` prop, defaulting to DRAW_NOTE, rendered in `.pic-wait-n`. The per-skin first line (DRAW_STATUS) stays.
- app/folio/panels-modal.tsx: `<PictureWait skin={skin} note={PANELS_NOTE} />`.
- app/folio/panels-modal.test.tsx: assert the loading caption shows "about half a minute" and the skin status line; picture-draw.test.tsx keeps asserting "about twenty seconds" for single pictures.

When done run `npx vitest run`, `npx tsc --noEmit -p .` and `npm run check:size`, fix failures, then report a short diff summary.
