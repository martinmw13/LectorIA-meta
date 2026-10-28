Review and fix round for task 13 on branch redis-env (this worktree). Do not
run `next start` or `next dev`. Never print or read secret values.
1. Review `git diff origin/main..HEAD` (Upstash env fallback to KV_REST_API_*).
   Look for correctness, security (read-only token must never be used, no
   values in errors or logs), and test gaps.
2. Fix items 2 and 3 of "Grok Bot review (round 0)" in docs/reviews/13.md:
   in server/images/handler.ts, when readImageEnv throws, log one line with
   console.warn of the form "image env missing: <names>" taken from the error
   message (names only; the client response stays the same generic
   unavailable). Add or adjust a handler test asserting the warn line names
   the missing keys and the response is unchanged. Split the long token
   comment in .env.example.
3. Append "## Muse review, round 1" to docs/reviews/13.md: your findings (Must
   / Should / Nit), what you fixed, and "Verdict: clean" or
   "Verdict: changes needed". Under items 2 and 3 of the Grok Bot review append
   "Resolved by <sha>: <one line>".
Run npm test, npx next typegen, npm run typecheck, npm run build,
npm run check:isolation, npm run check:secrets, npm run test:hooks,
npm run check:size. Commit through the hook with trailer
"Co-authored-by: Muse Code (Meta) <muse-code@agents.noreply.invalid>".
