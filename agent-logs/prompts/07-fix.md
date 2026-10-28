Fix round for branch `picture-this`. Read docs/reviews/07.md and address findings 1-6 (all of them; for 5 only update docs/contracts.md wording, keep list()). Do not stop to ask questions. Spec: agent-logs/prompts/07-spec.md.

Constraints:
- Keep every server/ file starting with `import "server-only"`. core/ stays pure.
- No raw error text to clients ever; unexpected throws return code "unavailable" with the existing Spanish MSG_UNAVAILABLE/MSG_FAILED and log only a short fixed string (no secrets, no error objects with headers).
- Refund only what was actually reserved, exactly once; always best-effort release the lock (release failures must not throw out).
- No new dependencies. No real network calls in tests. No real image generation.
- Run `npm test`, `npm run typecheck`, `npm run build`, `npm run check:size`, `node scripts/check-secrets.mjs --all` and make them pass.
- Commit (do not push) with a short imperative message. Do not edit docs/reviews/07.md.
