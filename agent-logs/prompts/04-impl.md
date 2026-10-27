Implementation step for task 4 (Contributor). Implement docs/tasks/04-pipeline-oz.md (the design) and the spec below, then run the real pipeline on Oz. Do not commit or push; leave changes in the working tree. Do not edit `.agents/skills/`. Read AGENTS.md and SECURITY.md first; they are binding. Apply the skills in `.agents/skills/`: architect (follow the design), typescript-best-practices, principle-prove-it-works, ponytail (full), unslop for prose.

One correction to the design: `JevResult` (and every type stored in data files) lives in `core/types.ts`, because core must not import from pipeline. pipeline/jev.ts imports it from core.

Order of work:
1. package.json devDependencies and scripts, tsconfig.json, `npm install` (creates package-lock.json), size-check ignore pattern.
2. core modules with their tests; `npm test` and `npm run typecheck` green.
3. pipeline modules with the fake-client tests.
4. Real runs, one step at a time: `npm run build:book -- oz --step ingest`, then `--step segment`, then `--step classify`, then `--step cluster`. META_API_KEY and JEV_API_KEY are already in the environment; never print, echo, or write their values (do not run `env`, `printenv`, or `echo $..._KEY`). Fix real-run problems in code (for example response shape drift) and rerun only the failed step. Expected cost is well under USD 0.10 total; if a step looks like it will cost more than USD 0.50, stop and report instead.
5. Sanity check the outputs: 24 chapters, scene count, dominant emotion distribution, override rate, failures, the 15 prompts. Read a few scenes (the cyclone in chapter 1, the Kalidahs in chapter 7, the poppy field in chapter 8, the Winged Monkeys in chapter 14) and check the final emotions are plausible.
6. Final checks: `npm test`, `npm run typecheck`, `npm run test:hooks`, `npm run check:size`, `node scripts/check-secrets.mjs --all`, and `~/.local/bin/gitleaks dir . --redact --no-banner` if the binary exists. All green.
7. Add a row to BUILT_DURING_HACKATHON.md for 2026-10-27, task 4, built by Muse Code (Contributor), matching the existing table style.

Never call MusicGen, Modal, or any audio service, and add no code that does.

Final message: files changed, test results, the summary numbers from the real run (chapters, paragraphs, scenes, emotion distribution, override rate, failures, Jev and Meta cost), anything odd you saw in the data.

The spec:

# Task 4 spec: Oz pipeline (ingest, scenes, emotions, music clusters)

Repo: LectorIA-meta, branch `pipeline-oz`. Read AGENTS.md, docs/product-rules.md (if present), SECURITY.md first; they are binding. Another stream builds the Next.js skeleton in parallel on another branch, so do NOT create app/, server/, next config, or UI. Only `core/`, `pipeline/`, `data/books/oz/`, tests, docs, and the minimal package.json/tsconfig changes listed here.

Skills to apply (read them in `.agents/skills/`): architect, typescript-best-practices, principle-prove-it-works, ponytail (full), ponytail-review, unslop.

## Hard rules
- `core/` is pure: no env reads, no fetch, no fs, no keys. Pure functions and types only. `pipeline/` holds the Node code that reads env, does fs and network, and injects clients into the orchestration functions so tests use fakes.
- Secrets come only from env (`META_API_KEY`, `JEV_API_KEY`). Never print, log, or write them. Never log request headers. Error messages include status code and a short body excerpt only.
- Emotion ids: `calma, alegria, tristeza, suspenso, misterio, aventura, combate, asombro` (export one `EMOTIONS` const tuple from core and derive the type). Jev also gets `unknown`. A hard failure stores no vector; never fake an emotion.
- Paragraph ids `c{ch}p{k}` (k = 1-based index inside the chapter), plus a global 1-based ordinal `n`. All range logic compares `n`, never id strings.
- Deps: add only devDependencies `tsx`, `typescript`, `vitest`, `@types/node`. No zod, no openai SDK, no other runtime deps: use global fetch. Scripts: `"test": "vitest run"`, `"typecheck": "tsc --noEmit"`, `"build:book": "tsx pipeline/build.ts"`. Keep existing scripts. Add a minimal strict `tsconfig.json` (target ES2022, module ESNext, moduleResolution Bundler, strict, noUncheckedIndexedAccess, noEmit, types ["node"], include core, pipeline). Relative imports without extensions.
- Each authored file stays under 5000 tokens (20000 bytes); split modules if needed. Add `'data/books/'` to IGNORE_PATTERNS in scripts/check-file-size.mjs under the "Processed book data" comment (book.json is generated, ~230 KB) and extend the existing size test if one covers the list.
- Prose: unslop, sentence-case headings, no em dashes, no emoji.

## Step 1: ingest (core/gutenberg.ts, pipeline/ingest.ts)
Raw source: `data/raw/oz/pg55.txt` (gitignored, already downloaded; if missing, the pipeline downloads https://www.gutenberg.org/cache/epub/55/pg55.txt). The file uses CRLF. Structure: Gutenberg header up to `*** START OF THE PROJECT GUTENBERG EBOOK ... ***`, then `[Illustration]`, title, dedication, a Contents list whose lines look like ` Chapter I. The Cyclone` (indented, with a period), an `Introduction` by the author, then chapters whose heading is a line exactly `Chapter I` (roman numeral alone) followed by the title line (`The Cyclone`). Ends at `*** END OF THE PROJECT GUTENBERG EBOOK ... ***`, then license.
- Strip Gutenberg header/footer by the START/END markers (fail if missing). Drop the book's own front matter: everything before the first real chapter heading (regex `^Chapter ([IVXLC]+)$` on a trimmed line, which the indented Contents lines do not match). Drop `[Illustration...]` lines. Paragraphs are blocks separated by blank lines; unwrap lines with single spaces, collapse whitespace, keep the original punctuation and curly quotes. Expect 24 chapters.
- book.json shape (export the types from core/types.ts):
  `{ id: "oz", title, author, source: { gutenberg: 55, url }, textVersion: "sha256:<hex>", chapters: [{ ch, title, start_n, end_n }], paragraphs: [{ id, ch, n, text }] }`
  textVersion = sha256 over the paragraphs as `id\ttext` lines joined with `\n` (compute the hash in pipeline with node:crypto, or pass a hash fn into core; core stays free of node imports).
- Freeze: if data/books/oz/book.json exists and its textVersion differs from a fresh ingest, fail with a clear message unless `--force`. Same textVersion: leave the file untouched.
- Per-book config in `pipeline/books.json`: `{ "oz": { "gutenberg": 55, "title": "The Wonderful Wizard of Oz", "author": "L. Frank Baum" } }`.

## Step 2: scenes (core/scenes.ts, pipeline/segment.ts)
- One Meta call per chapter. Meta API: `POST https://api.meta.ai/v1/chat/completions`, `Authorization: Bearer $META_API_KEY`, OpenAI-compatible body `{ model, messages, reasoning_effort: "low", max_tokens: 4000, response_format: { type: "json_schema", json_schema: { name, strict: true, schema } } }`. Model from `META_MODEL` env, default `muse-spark-1.3-contributor`. The answer JSON is in `choices[0].message.content`; usage in `usage.prompt_tokens`, `usage.prompt_tokens_details.cached_tokens`, `usage.completion_tokens`. With small max_tokens the content comes back empty because reasoning eats the budget: treat empty or unparseable content as a retryable error.
- Prompt: the chapter title plus its paragraphs labelled with `n`. Ask for scenes in order, each `{ start_n, end_n, title, summary, characters }`: a scene is a stretch with one dominant mood, so the soundtrack can change inside a chapter at mood shifts (location change, danger starts or ends, a reveal). Guide length: usually 3 to 25 paragraphs; very short chapters may be a single scene.
- `validateSceneCoverage(chapter, scenes)` in core: first start_n equals chapter.start_n, each start_n equals previous end_n + 1, last end_n equals chapter.end_n, start_n <= end_n. Returns a typed list of problems. On invalid output, retry the call once with the problems in the prompt, then fail the run (no silent repair).
- Scene ids `c{ch}s{k}`. Write `data/books/oz/scenes.json`: `{ bookId, textVersion, scenes: [{ id, ch, start_n, end_n, title, summary, characters }], provenance }`. A whole-book validator also checks no scene crosses chapters and the union covers every paragraph exactly once.
- Skip the step if scenes.json exists with the same textVersion, unless `--force`.

## Step 3: emotions (core/emotion.ts, pipeline/classify.ts)
- Jev API: `POST https://api.typesafe.ai/v1/systemone`, `Authorization: Bearer $JEV_API_KEY`, body `{ model: "jev-1.14.0", state, questions }`. Model from `JEV_MODEL` env, default `jev-1.14.0`. One request per scene. Real response sample:
  ```
  {"model":"jev-1.14.0","answers":{"emotion":{"type":"choice","choice":"combate","confidence":0.87,"probabilities":{"calma":0.0,"combate":0.9,"suspenso":0.1,"unknown":0.0}},
   "intensity":{"type":"score","score":1.98,"confidence":0.98,"legend":{"0":"low","1":"medium","2":"high"},"probabilities":{"0":0.0,"1":0.01,"2":0.99}}},
   "usage":{"input_tokens":403,"output_tokens":66}}
  ```
  Questions: `emotion`: `type: "choice"`, `instructions` refers to `scene` in state ("Which feeling should the soundtrack carry for `scene`?"), `criteria` an object with all 8 emotion ids plus `unknown`, each with a one-line description. `intensity`: `type: "score"`, criteria a 5-level array from very low to very high (emotional and dramatic intensity). `tempo`: `type: "score"`, 5 levels from very slow and still to very fast and urgent (pace and energy of the action). Normalize score as score / (levels - 1) to 0..1. `state`: `{ book, chapter, scene_title, scene }` where scene is the joined paragraph text (cap at about 12000 characters, keep the start and end if longer).
- Store per scene in analysis.json: `jev: { vector (all 9 ids incl. unknown, missing ids filled with 0), choice, confidence, intensity, intensity_confidence, tempo, tempo_confidence, model }`, `muse_override: { vector (8 ids), reason, model } | null`, `final: { vector (8 ids, sums to 1), intensity, tempo } | null`, `error: string | null`.
- Decision in core (pure, tested): override needed when `choice === "unknown"`, or emotion confidence < `LOW_CONFIDENCE = 0.6`, or the unknown probability is the max. Otherwise final.vector = jev vector without unknown, renormalized.
- Override: Meta call with json_schema output `{ vector: { <8 ids>: number }, reason: string }` (reason: one short sentence). The prompt gives the scene text, the Jev vector, and asks for a probability mix over the 8 ids only. Core clamps negatives to 0 and renormalizes; an all-zero vector is a failure. final.intensity and final.tempo come from Jev.
- Hard failure (Jev error after retries, or override failure): `jev`/`final` null as appropriate plus `error`; the run reports it and continues. Never invent a vector.
- Retries: 3 attempts with backoff on network errors, 429 and 5xx, for both clients. Concurrency limit 4 (small helper, no dep).
- analysis.json top level: `{ bookId, textVersion, scenes: [...scene fields + jev/muse_override/final/error], override_rate, provenance: { date, jev: { model, requests, input_tokens, output_tokens, cost_usd }, meta: { model, requests, prompt_tokens, cached_tokens, completion_tokens, cost_usd } } }`. Prices: Jev USD 0.042 per 1M input tokens, output free. Meta contributor: input 0.10, cached input 0.002, output 0.20 USD per 1M tokens (cached tokens are part of prompt_tokens; bill them at the cached rate). Put prices in one constant table. scenes.json provenance holds the segment step's Meta usage the same way; analysis.json provenance also reports the segment cost (sum both into a `total_cost_usd`).

## Step 4: music clusters (core/cluster.ts, core/music-prompt.ts, pipeline/cluster-tracks.ts)
- Features per classified scene: the 8 final vector values, plus `FEATURE_WEIGHTS` for intensity and tempo (start with 0.5 each; justify in a comment). Scenes with final null are left out and listed as `unclustered`.
- Deterministic k-means: k = min(15, number of scenes); k-means++ init with a seeded PRNG (mulberry32, seed 42), 20 restarts with derived seeds, keep the lowest inertia, at most 100 iterations, an empty cluster is reseeded with the point farthest from its centroid. Same input gives byte-identical output.
- Sort clusters by dominant emotion order in EMOTIONS, then intensity, and name them `t01`..`t15`.
- `core/music-prompt.ts`: a deterministic template. Every prompt shares one base so the 15 tracks sound like one soundtrack: the same chamber orchestra (strings, flute, clarinet, oboe, French horn, harp, celesta, timpani, light percussion), the same recurring simple folk-like leitmotif in a major key (minor variants for sad or dark moods), storybook fantasy film score, instrumental, no vocals, seamless loop. Vary mood words from the top two emotions (with their weights), dynamics from intensity, and a BPM range from tempo. Keep each prompt under ~400 characters.
- Write `data/books/oz/music-clusters.json`: `{ bookId, textVersion, k, seed, feature_weights, clusters: [{ id, size, centroid: { vector, intensity, tempo }, dominant: [top2 ids], bpm: [lo, hi], scenes: [ids in reading order], prompt }], unclustered, provenance }`. No network in this step.
- Do NOT call MusicGen, Modal, or any audio service. Do not add any code that does.

## CLI
`npm run build:book -- oz [--step ingest|segment|classify|cluster] [--force]`; without --step it runs all four in order. Load `.env.local` if present with `process.loadEnvFile` (guard if missing). Print short progress lines and a final summary (chapters, paragraphs, scenes, emotion distribution by dominant final emotion, override rate, failures, Jev and Meta cost). Never print env values.

## Tests (vitest, *.test.ts next to the code)
- gutenberg: strip and split on a small inline fixture shaped like the real file (CRLF, Contents lines, Introduction, two chapters, an [Illustration] line); ids, n, chapter ranges.
- scenes: coverage validator accepts good input and reports gap, overlap, cross-chapter, out-of-range.
- emotion: override decision, renormalization, all-zero failure.
- classify orchestration with fake Jev and Meta clients: an override path, a hard failure path that stores no vector, cost totals.
- cluster: determinism (same output twice), k bounds, every scene in exactly one cluster; prompt shares the base and stays under the length.
- data: a test that loads the committed data/books/oz/book.json, scenes.json, analysis.json and music-clusters.json (skip a file if it does not exist yet) and checks 24 chapters, sequential n, full scene coverage, final vectors sum to 1, every classified scene in exactly one cluster.
