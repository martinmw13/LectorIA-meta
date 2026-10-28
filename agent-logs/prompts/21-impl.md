Task 21 on branch daily-cap (this worktree). Do not run `next start`/`next dev`. Do not read or print secret values; never create .env files. Never run `npm run build:book`. Keep the diff small and inside core/images.ts, server/images/ (env.ts, orchestrate.ts, quota-related code), their tests, and docs/contracts.md. Other PRs (image styles, redesign, home) are in flight: do not refactor unrelated code.

Goal: a GLOBAL DAILY spend cap on top of the existing total cap (SPEND_CAP_USD, default 10) for actions paid with our Meta key (today: new image generation in server/images/orchestrate.ts).

1. env.ts: new optional env DAILY_SPEND_CAP_USD, default 1.5 when unset or not finite/negative -> `dailySpendCapMicro` in ImageEnv. Update env.test.ts.
2. core/images.ts: `dailySpendKey(day: string)` (day = the UTC day string YYYY-MM-DD already passed as deps.day; confirm deps.day is UTC and document "UTC day"), DAILY_SPEND_TTL_SEC = 172800. Replace MSG_BUDGET with two warm messages and a new error code:
   - total cap, code "budget": "Our free credits for the hackathon are used up. Thanks for reading with us! You can keep going by bringing your own key."
   - daily cap, code "daily_budget": "So many readers today that our free credits for today are used up. Come back tomorrow, or bring your own key."
   Add "daily_budget" to the error code union in core/types.ts.
3. orchestrate.ts: right after the total-spend INCRBY succeeds and is under cap, INCRBY dailySpendKey(day) by the same imageCostMicro() and EXPIRE it with the TTL (set the expiry every time; cheap and idempotent). If daily total exceeds dailySpendCapMicro (use budgetExceeded), refund both the daily and total counters plus quota, release the lock, return the daily_budget error. Atomic INCRBY means concurrent overshoot is at most one request and is refunded. Failures after reservation must refund the daily counter too (exactly once, like the existing refund helpers). Cached hits never touch the counters.
4. BYOK: there is no BYOK path yet. Add a short comment that the caps apply only to our key; the future BYOK path must skip them. Do not build BYOK.
5. Tests (orchestrate.test.ts with the in-memory KV fake): under the daily cap generates; crossing the daily cap returns daily_budget with the friendly message and refunds counters/quota and does not call generate; a new day (different deps.day) resets and generates; total cap still enforced (code budget); generation failure refunds the daily counter; cached hit unaffected.
6. docs/contracts.md Images api section: document `daily_budget`, DAILY_SPEND_CAP_USD (default 1.5, UTC day, key TTL 48 h), both messages, and that the caps apply only to requests paid with our key.

Run `npx vitest run` and `npx tsc --noEmit` and `npm run lint` if present; all must pass. Commit with message "Add a global daily spend cap for our key" and trailer:
Co-authored-by: Muse Code (Meta) <muse-code@agents.noreply.invalid>
