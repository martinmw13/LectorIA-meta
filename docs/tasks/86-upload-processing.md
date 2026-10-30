# Design: task 86 upload processing

Goal: server path turning a browser-parsed EPUB into the same data a shelf
book has (`BookPayload`: book + analyzed scenes), behind free/BYOK caps, one
chapter-part per request so every call finishes under the 60 s Hobby budget.

## API

- `POST /api/uploads` — body `{title, author?, sections, turnstileToken?}`
  where `sections` is the browser's parsed EPUB sections (`RawSection[]`).
  Validates, cleans (deterministic + contributor judge), takes quota/spend
  (free only), stores `book.json` in private Blob, job state in Redis.
  Returns `{status:"created", id, chapters, parts}`.
- `POST /api/uploads/<id>/step` — body `{}` or `{chapter}`. Segments and
  classifies the next pending part (or that chapter's next part), stores the
  part result. Returns `{status:"working", id, done, total}` or
  `{status:"done", id, done, total, costUsd}` after finalizing.
- `GET /api/cron/cleanup-uploads` — deletes `uploads/` blobs older than 30
  days. Bearer `CRON_SECRET`, daily schedule in `vercel.json`.

Full contract in `docs/uploads.md`. Reader entry: `loadUploadedBook(id)`
in `server/uploads/loader.ts` (wired into `server/books.ts` later, by owner).

## Flow

Create: same-origin + body cap + strict parse → env → Turnstile →
anon cookie → BYOK header? → deterministic clean + word count
(`too_long` past 50k free / 400k BYOK) → quota (2/day free, 10/day BYOK,
IP or cookie) → spend reserve (sized, total + `upload:spend:daily`
caps) → judge → build book + textVersion → split parts (≤150 paras) →
Blob + Redis.

Step: guards as above → load job (free jobs bind the anon cookie, BYOK
jobs need the key header per call) → next pending part → Redis lock →
re-check part blob (idempotent, free) → segment via exported
`chapterPrompt`/`parseScenes` + `validateSceneCoverage` (one retry) →
classify each scene (Jev + `classifyScene` override when a server Jev key
exists, else contributor-only vector; per-scene errors keep `final: null`
like Oz) → store part with its usage → finalize under a 90 s lease when
all parts land (assign `c<ch>s<k>` ids, `validateBookCoverage`, settle
real spend through the once-guard).

Music: Oz has no stored cluster at runtime; the reader scores each scene's
`final` vector against the manifest (`rankScored`). Uploads reuse that path
by producing the same `final` shape. No new music code.

## Money and quota

- `FREE_BOOKS_PER_PERSON = 2`, day in key, 48 h TTL (`server/guard/quota`).
- `UPLOAD_DAILY_SPEND_CAP_MICRO = 1_000_000`; total cap shared with
  images/chat via `reserveSpend` with a `dailyKey` override (defaults keep
  old behavior and tests).
- Settle exactly once on every terminal path via a `setNxEx` guard
  (actual minus reserved); user errors never take quota; jobs still
  `working` past 6 hours are settled by the daily cleanup.

## Trust

Sections are untrusted: strict parse, caps on sections/blocks/chars, word
limits. Model calls have no tools and fixed prompts; output is clamped and
coverage-validated, emotion ids restricted to the 8. Every external call
has an `AbortSignal` timeout. Errors to the client are codes only; the
BYOK key stays in memory (header per call, never stored or logged).

## Review fixes

1. Sized reserve: `uploadReserveMicro(parts, words)` replaces the flat
   USD 0.25 hold (5k micro/part + 1 micro/word, 50k floor, 250k ceiling;
   a 3,955-word book measured USD 0.0027). The repair branch reconciles
   too, and the cleanup cron settles jobs still `working` past 6 hours.
2. Failed jobs keep `usageCostMicro(usage) - reservedMicro` and refund
   the book quota only when recorded usage is zero.
3. Usage lives in each part blob and is summed at finalize, the only
   money writer; the finalize key is a 90 s lease with a durable settle
   guard for exactly-once adjustment.
4. BYOK creates take a 10/day per-person quota (`upload:byok:` prefix),
   spend still free; exhaustion maps to `daily_books_reached`.

## Shortcuts

- Part results are re-segmented from scratch when a step is retried after
  a route kill; the Blob-exists check is the only dedup.
- Meta/Jev retries keep the pipeline's fixed policy; a pathological retry
  storm can hit the route kill, and the client just re-drives the step.
- No resplit pass for uploads (Oz-only refinement).
