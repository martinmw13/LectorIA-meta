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

## Reading and cleanup

`loadUploadedBook(id)` in `server/uploads/loader.ts` returns the
`BookPayload` the reader consumes (`{ book, scenes }`). Uploads expire
after 30 days; `GET /api/cron/cleanup-uploads` (Bearer `CRON_SECRET`,
daily) deletes their private blobs.

## Storage

Uploads live in a separate private Blob store, not the public image
store: a store's access mode is fixed at creation, so `access: "private"`
puts would fail against it. The token comes from
`UPLOADS_BLOB_READ_WRITE_TOKEN` (passed explicitly to every Blob call)
and the owner creates the store by hand. Without the token the routes
answer `unavailable`; they never fall back to the public store.
