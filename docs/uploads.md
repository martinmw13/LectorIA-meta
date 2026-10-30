# Upload processing API

Server path turning a browser-parsed EPUB into reader data. The browser
parses the file with `core/epub.ts` and POSTs the sections; the server
cleans, segments, and classifies one chapter-part per call so every
request finishes inside the Hobby 60 s budget.

## Create

`POST /api/uploads`, JSON body:

```json
{ "title": "Middlemarch", "author": "George Eliot", "sections": [RawSection], "turnstileToken": "…" }
```

`sections` is the `RawSection[]` shape from `core/clean-types.ts`. Limits:
50k words free, 400k with a key; 600 sections; 20k chars per block; 4 MB
body. BYOK sends its key per call in the `x-byok-key` header (in memory
only, never stored). Needs same-origin JSON plus the Turnstile/human
cookie flow shared with chat and images.

Success: `{ "status": "created", "id": "u-…", "chapters": 24, "parts": 24 }`.
The id is a 128-bit capability; free jobs also bind the anon cookie.
The cleaning judge gets 25 s inside this request; past that the book
keeps its deterministic chapters.

## Step

`POST /api/uploads/<id>/step`, body `{}` or `{ "chapter": 3 }` with an
optional `turnstileToken` when the human cookie expired. Processes the next
pending part (segment + emotion) and stores it. BYOK repeats the key header;
free repeats the cookies.

- `{ "status": "working", "id": "u-…", "done": 3, "total": 24 }` — call again.
- `{ "status": "done", "id": "u-…", "done": 24, "total": 24, "costUsd": 0.021 }`
  — the analysis is assembled; `costUsd` is the real Meta+Jev cost.

Re-driving a finished part or job is idempotent and free. Music needs no
step: scenes carry the same `final` emotion vectors Oz has, so the
existing track selection scores them unchanged.

## Errors

`{ "status": "error", "code": "<code>", "message": "…" }`. Codes: `too_long`
(use BYOK, 413), `daily_books_reached` (2/day, 429), `daily_budget_reached`
(503), `human_required` (403), `bad_request` (400), `unavailable` (503,
refunded), `not_found` (404), `expired` (30 days, 410).

## Money and quota

Free creates hold a sized reserve: 5k micro per part plus 1 micro per
word, floored at 50k and capped at 250k micro (a 3,955-word book measured
USD 0.0027). The hold reconciles to the real Meta+Jev cost at finalize;
each part result carries its own usage so parallel steps lose nothing,
and one settle guard keeps the adjustment exactly once. Failed jobs keep
what they spent and refund the book quota only when nothing ran; the fail
path settles before it saves the failed status, so a crash between the two
cannot leak the hold. Jobs still working after 6 hours are settled the same
way by the daily cleanup, which also settles any failed job still missing
its refund marker. BYOK spends the reader's key but still takes a
per-person quota of 10 creates a day; exhaustion answers
`daily_books_reached`.

## Reading and cleanup

`loadUploadedBook(id)` in `server/uploads/loader.ts` returns the
`BookPayload` the reader consumes (`{ book, scenes }`). `loadBook` in
`server/books.ts` delegates `u-` ids to it (no module cache: uploads
expire); missing or expired uploads 404. Uploads read at `/read/<id>`
with chat hidden, since chat runs on our key for shelf books only;
pictures, panels, and narration were already Oz-only. Uploads expire
after 30 days; `GET /api/cron/cleanup-uploads` (Bearer `CRON_SECRET`,
daily) deletes their private blobs.

## Client flow

`app/home/upload.tsx` parses the EPUB in the browser (`core/epub.ts`),
POSTs `{title, author, sections}` to `/api/uploads`, then drives
`POST /api/uploads/<id>/step` until `done` and navigates to
`/read/<id>` (`app/home/upload-flow.ts`). The BYOK key travels in the
`x-byok-key` header on every call and stays in React state; finished
books land in the localStorage "Your books" list
(`{id, title, author, savedAt}`, newest first, 20 max). The human check
reuses the chat/images Turnstile widget when the server asks for it.
Steps retry network failures and uncoded 5xx up to 3 times with
backoff and resume from the server's `done/total`; coded errors map to
the next step (`too_long`, `daily_books_reached`, `daily_budget_reached`
open the key step, `human_required` re-asks the check,
`expired`/`not_found` restart the upload). The free hint allows 2 books
per UTC day (`core/upload-policy.ts`, `app/home/free-book.ts`); the
server enforces the real quota.

## Storage

Uploads live in a separate private Blob store, not the public image
store: a store's access mode is fixed at creation, so `access: "private"`
puts would fail against it. The token comes from
`UPLOADS_BLOB_READ_WRITE_TOKEN` (passed explicitly to every Blob call)
and the owner creates the store by hand. Without the token the routes
answer `unavailable`; they never fall back to the public store.
