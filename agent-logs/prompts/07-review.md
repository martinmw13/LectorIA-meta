You are reviewing branch `picture-this` (commits since origin/main) in this repo. Use the skill ponytail-review only; other skills are disabled here, apply their intent yourself (boundary discipline, prove it works, strict TypeScript). Do not stop to ask questions.

Task spec: agent-logs/prompts/07-spec.md. Design: docs/tasks/07-picture-this.md. Read AGENTS.md and docs/contracts.md.

Review `git diff origin/main...HEAD` for correctness, security, and spec conformance. Focus on:
- META_API_KEY and all secrets server-only; nothing secret reachable from client bundles; no raw error text to clients (including unhandled throws from KV/Blob/loadOzBook in the route: a failed Upstash call must not leak a lock or return a raw 500 body).
- Lock / quota / budget accounting: every failure path after reserving refunds exactly once and releases the lock; no double counting; cache hits never consume quota.
- Cache key = book + textVersion + start paragraph n (or sceneId) + PROMPT_VERSION; prompt built only from trusted server text.
- Client polling behaviour, loading/cached/new UI, Spanish copy, Meta blue #0866FF, no purple.
- Tests cover the orchestration order and the failure paths.

Write findings to docs/reviews/07.md: a verdict line (APPROVE or CHANGES), then numbered findings each tagged [must]/[should]/[nit] with file:line and a concrete fix. Be terse. Do not modify any other file. Do not commit.
