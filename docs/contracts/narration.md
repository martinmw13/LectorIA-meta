# Narration

Read-aloud narration, one compact mp3 per chapter plus a per-chapter
manifest with sentence timings. The unit is the chapter (owner
decision): the reader plays any scene by seeking to its first sentence
(`sceneSpan`) and highlights the sentence being read (`activeChunkAt`).
Voice Kokoro-82M `af_heart` at speed 0.95, generated on a Modal GPU
function that scales to zero.

## Manifest

`ChapterNarration` in `core/narration.ts`: `format: 2`, `key`, `src`,
`durationSec`, `voice`, `model`, `speed`, and `chunks` with `n`
(paragraph ordinal), `start`/`end` (char offsets into the paragraph),
`t0`/`t1` (seconds), and `w` (word timings, below).
`parseChapterNarration` throws on any bad field: it is a trust
boundary, since the reader fetches this JSON. `src` is an `https:`
URL or a same-origin path under `/narration/`.

## Word timings

No forced alignment: the Modal function returns each Kokoro token
timestamp with chapter-absolute seconds per span, and `alignWords`
maps them onto display words (`/[\p{L}\p{N}]+(?:['’][\p{L}\p{N}]+)*/u`,
so "Oz’s" and "didn't" are one word and punctuation never
highlights). Both sides compare on NFKD lowercase letters and digits
with apostrophes dropped, in order with a lookahead of 3 either way;
a token spanning several display words ("well-known") splits its time
by character length. Words left without time interpolate between
their neighbours; all times are clamped to the span and monotonic.
`w` is flat `[start, end, t0, t1, ...]` with paragraph-relative char
offsets and seconds, validated (multiple of 4, offsets in range,
times in range, sorted) and required. `activeWordAt` drives the
highlight, `wordAt` drives click-to-seek. Cost: 4 numbers per word,
about 25 KB per chapter manifest.

## Cache key

`narrationKeyInput` builds a canonical string from the
NFC-normalized, whitespace-collapsed chunk texts joined with `"\n"`,
plus voice, model, speed, and format. Callers hash it with SHA-256;
`narrationKey` returns `narration/v2/<voice>/<first 32 hex>`. Same
text + voice + model + speed gives the same key, any edit gives a new
one. Audio lives at `<key>.mp3`, the manifest at `<key>.json`, as
deterministic public Blob paths; the Redis index `narr:idx:<key>`
holds the manifest JSON. Oz is pregenerated through the same keys, so
a second reader of the same text gets it free.

## Concurrency

One reusable function, `ensureChapterNarration` in
`core/narration-cache.ts`, serves the offline Oz run and the future
upload route: index hit, then store hit with index backfill, then lock
`narr:lock:<key>` (TTL 300 s, `setNxEx`; a null acquire means
`pending`), one index re-check, budget reserve, synthesize, put audio
and manifest, index set, release. Cache hits never touch the lock or
the budget; failures refund once and release. No error text leaves the
function.

## Spend

Integer micro-dollars. `estimateNarrationMicro(chars)` reserves the
cap before generating: about 15 chars of audio per second, GPU time
about 2% of audio after encode, plus 8 s of cold start/overhead, at
the A10G rate (`KOKORO_GPU_USD_PER_SEC`, about USD 1.10/h). The Modal
function tries GPUs in order `["L4", "A10G", "T4"]`, and caps use the
A10G rate so they stay conservative whichever GPU serves. The
server reserves on both the global spend key and the daily spend key
(`spendKey()`, `dailySpendKey(day)` from `core/images`), refunding
both past either cap; the global `DAILY_SPEND_CAP_USD` applies. The
offline run caps with `NARRATION_CAP_USD` (default 2) and stops with a
report instead of spending more. Worked number: an average Oz chapter
of ~9,000 chars is about 10 min of audio, about 20 s of warm GPU,
about USD 0.006.

## Rolling window

The owner warms two chapters ahead: at upload, chapters 1 and 2 while
the book is processed; entering chapter N ensures N+1 and N+2; jumping
to N ensures N and N+1. `chaptersToPrepare` in `core/narration.ts`
computes the window; the client asks, the server dedupes through the
index and lock.

## Cold start

About 15–30 s for the first chapter after the function scaled to zero
(`scaledown_window=60`), warm calls a few seconds per chapter. The
2-ahead window hides it after chapter 1. While a chapter is pending,
the Read aloud control shows a quiet "Getting the voice ready…"
state.

## Operations

Deploy with `modal deploy pipeline/modal/narrate.py`; the app
`lectoria-narration` scales to zero a minute after the last call, and
`modal app stop lectoria-narration` removes it entirely.

## Open items

Upload route wiring (uses `server/narration/cache.ts`, no route yet);
Blob vs `public/` for Oz (same keys either way, so switching is a
re-run).
