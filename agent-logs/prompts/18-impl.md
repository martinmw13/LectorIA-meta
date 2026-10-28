Task 18 on branch resplit-keep (this worktree). Do not run `next start` or
`next dev`. Do not read or print secret values; never create .env files. Never
run `npm run build:book` (it calls paid APIs). Stay inside pipeline/ and core/
plus the docs named below.

Problem: in pipeline/resplit.ts the per-scene worker inside `runPool` throws
`scene ${scene.id} titles do not cover the split ranges` when Muse's
resplit_titles answer does not match the planned ranges. One bad Muse answer
aborts the whole book build and wastes the run's spend. A Muse call that
rejects (network/HTTP error) in the resplit_decision ask or the resplit_titles
call has the same effect. A Jev window failure, by contrast, already keeps
the scene whole and records the id in `window_failures`.

Change (smallest diff):
1. Treat both cases like the Jev window failure: keep the original scene whole
   (the worker returns null), record it, continue with the other scenes.
   Record into a new provenance array `provenance.resplit.muse_failures:
   { from: string; reason: string }[]` (reason: short, e.g. "titles do not
   cover the split ranges" or the error message truncated to 200 chars; never
   include request bodies or keys). Spend already tracked for that scene stays
   counted. Do not wrap the whole worker in a broad try/catch: catch only
   around the Muse calls and the title/range check. The post-pool duplicate-id
   and coverage checks must still throw (those are real bugs).
2. Update the file header comment if needed and the resplit provenance shape
   in docs (grep docs/ for `window_failures` and add `muse_failures` next to
   it in one short clause).
3. Tests in pipeline/resplit.test.ts, reusing setupDir and the fake clients:
   (a) titles answer with wrong ranges for one scene: runResplit resolves,
   that scene keeps its original id and range, the other scene still splits,
   muse_failures has one entry with its id, coverage still valid;
   (b) titles call rejects: same outcome;
   (c) resplit_decision ask rejects: scene kept whole, recorded.
   Normal-path tests must stay unchanged and green.

A normal full run's behaviour and output must not change except the new
(empty) `muse_failures: []` array in the resplit provenance. Do not touch
data/books/oz.

Run npm test, npm run typecheck, npm run check:isolation, npm run
check:secrets, npm run test:hooks, npm run check:size. Commit through the
hook with message "Keep a scene whole when Muse resplit answers fail" and
trailer "Co-authored-by: Muse Code (Meta) <muse-code@agents.noreply.invalid>".
