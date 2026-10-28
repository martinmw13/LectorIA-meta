Small task on branch redis-env (this worktree). Do not run `next start` or
`next dev`. Do not print or read any secret values; never create .env files
with real values.

Context: Vercel's Upstash for Redis marketplace integration injects
KV_REST_API_URL, KV_REST_API_TOKEN, KV_REST_API_READ_ONLY_TOKEN, KV_URL and
REDIS_URL. Our code only reads UPSTASH_REDIS_REST_URL and
UPSTASH_REDIS_REST_TOKEN, so production reports the images API unavailable.

Change:
1. server/images/env.ts: resolve the Redis REST URL as UPSTASH_REDIS_REST_URL
   if non-empty, else KV_REST_API_URL; the token as UPSTASH_REDIS_REST_TOKEN if
   non-empty, else KV_REST_API_TOKEN. Never use KV_REST_API_READ_ONLY_TOKEN
   (we write). Each value falls back independently; keep it simple
   and readable. The missing-env error must list names only (e.g.
   "UPSTASH_REDIS_REST_URL|KV_REST_API_URL") and never values.
2. server/images/handler.test.ts: save/restore the KV_* names too; make the
   "env missing" test delete all of them; add tests (in a small
   server/images/env.test.ts if cleaner) that: UPSTASH_* wins when both set;
   KV_REST_API_* is used when UPSTASH_* is absent or empty; the read-only token
   alone is not accepted; the error message never contains a value.
3. .env.example: document the KV_REST_API_URL / KV_REST_API_TOKEN fallback
   (empty values) next to the UPSTASH lines, and say the read-only token is
   unused.
4. docs/tasks/07-picture-this.md step 11 and docs/contracts.md if they list
   the env names: mention the fallback in one short clause.
5. Grep the repo (excluding agent-logs and node_modules) for any other reader
   of these names and apply the same rule.

Keep the diff tiny. Run npm test, npx next typegen, npm run typecheck,
npm run build, npm run check:isolation, npm run check:secrets,
npm run test:hooks, npm run check:size. Commit through the hook with message
"Accept Vercel KV_REST_API_* names for Upstash Redis" and trailer
"Co-authored-by: Muse Code (Meta) <muse-code@agents.noreply.invalid>".
