# Design: task 4 Oz pipeline (Standard model)

Goal: ingest the Oz text, split chapters into scenes with Meta, classify each scene with Jev plus a Meta override on low confidence, and cluster scene vectors into about 15 music track prompts. Branch `pipeline-oz`. The Next.js skeleton lands on another branch, so this task touches only `core/`, `pipeline/`, `data/books/oz/`, tests, docs, and the listed config changes.

Binding inputs: AGENTS.md (project and Lectoria rules), SECURITY.md. There is no `docs/product-rules.md`; AGENTS.md carries the product rules. The raw text lives at `data/raw/oz/pg55.txt` (gitignored, CRLF, 24 chapters numbered I through XXIV, confirmed by heading scan).

## Module layout

```text
core/
  types.ts          book, chapter, paragraph, scene, emotion, provenance types, EMOTIONS
  gutenberg.ts      strip header/footer, split paragraphs, assign ids and ordinals
  scenes.ts         scene coverage validators (single chapter, whole book)
  emotion.ts        override decision, renormalization, final assembly
  cluster.ts        deterministic k-means over scene features
  music-prompt.ts   base template plus per cluster mood, dynamics, BPM
pipeline/
  books.json        per book config (gutenberg id, title, author)
  http.ts           fetchWithRetry plus a small concurrency pool (no dep)
  meta.ts           Meta chat client (OpenAI compatible body, usage parse)
  jev.ts            Jev client (state and questions builder lives here, not core)
  prices.ts         one price table and cost helpers (Jev, Meta, totals)
  cache.ts          skip if output exists with same textVersion, unless force
  ingest.ts         read raw or download, call core, freeze check, write book.json
  segment.ts        one Meta call per chapter, validate, retry once, write scenes.json
  classify.ts       one Jev call per scene, override path, write analysis.json
  cluster-tracks.ts feature build, k-means, prompts, write music-clusters.json
  build.ts          CLI entry: args, env load, step order, summary print
```

`core/` exports pure functions and types only. `pipeline/` reads env, files, and network, and passes clients into orchestration functions as arguments so tests inject fakes.

## Core types and signatures

`core/types.ts` holds every shared shape. `EMOTIONS` is the single source: `export const EMOTIONS = [...] as const` with the 8 ids in AGENTS.md order, and `export type EmotionId = (typeof EMOTIONS)[number]`. Jev ids add `unknown`: `export type JevEmotionId = EmotionId | "unknown"`.

```ts
// Branded ordinals keep n apart from chapter numbers.
export interface Book { id: string; title: string; author: string;
  source: { gutenberg: number; url: string }; textVersion: string;
  chapters: Chapter[]; paragraphs: Paragraph[]; }
export interface Chapter { ch: number; title: string; start_n: number; end_n: number; }
export interface Paragraph { id: string; ch: number; n: number; text: string; }
export interface SceneInput { start_n: number; end_n: number; title: string;
  summary: string; characters: string[]; }
export interface Scene extends SceneInput { id: string; ch: number; }
export type Vector8 = Record<EmotionId, number>;
export type Vector9 = Record<JevEmotionId, number>;
export interface SceneEmotion { jev: JevResult | null; muse_override: OverrideResult | null;
  final: { vector: Vector8; intensity: number; tempo: number } | null; error: string | null; }
export const LOW_CONFIDENCE = 0.6;
export const FEATURE_WEIGHTS = { intensity: 0.5, tempo: 0.5 } as const;
```

`core/gutenberg.ts`:

```ts
export function stripGutenberg(raw: string): string; // throws when markers missing
export function splitParagraphs(text: string): string[]; // blank line blocks, unwrap, collapse
export function buildBook(input: { title: string; author: string; gutenberg: number;
  chapters: { title: string; paragraphs: string[] }[] }): Omit<Book, "textVersion">;
export function canonicalLines(paragraphs: Pick<Paragraph, "id" | "text">[]): string;
// pipeline hashes canonicalLines with node:crypto; core never imports node.
```

Chapter heading regex `^Chapter ([IVXLC]+)$` on the trimmed line, so indented Contents lines never match. Lines starting with `[Illustration` are dropped. Paragraph ids are `c{ch}p{k}`, ordinals `n` global from 1. All range checks compare `n`.

`core/scenes.ts`:

```ts
export interface CoverageProblem { code: "gap" | "overlap" | "bad-start" | "bad-end" | "order" | "cross-chapter" | "out-of-range"; message: string; }
export function validateSceneCoverage(chapter: Chapter, scenes: SceneInput[]): CoverageProblem[];
export function validateBookCoverage(book: Pick<Book, "chapters" | "paragraphs">, scenes: Scene[]): CoverageProblem[];
```

Problems are data, not throws, so the caller can paste them into the retry prompt and then fail.

`core/emotion.ts`:

```ts
export function needsOverride(input: { choice: JevEmotionId; confidence: number;
  probabilities: Partial<Record<JevEmotionId, number>> }): boolean;
export function renormalize8(vector: Partial<Record<EmotionId, number>>): Vector8 | null;
  // clamps negatives to 0, fills missing with 0, scales to sum 1; null when all zero
export function jevFinal(input: { probabilities: Partial<Record<JevEmotionId, number>>;
  intensity: number; tempo: number }): SceneEmotion["final"];
```

Override rule: choice is `unknown`, or confidence below 0.6, or `unknown` holds the max probability. Otherwise final drops `unknown` and renormalizes. Final intensity and tempo always come from Jev.

`core/cluster.ts`:

```ts
export interface WeightedPoint { sceneId: string; features: number[]; } // 8 vector + intensity + tempo
export interface Cluster { points: WeightedPoint[]; centroid: number[]; inertia: number; }
export function buildFeatures(input: { vector: Vector8; intensity: number; tempo: number }): number[];
export function kmeans(points: WeightedPoint[], k: number, opts?: { seed?: number;
  restarts?: number; maxIter?: number }): Cluster[]; // defaults 42, 20, 100
export function mulberry32(seed: number): () => number;
```

Empty cluster reseeds with the point farthest from its centroid. Output order is deterministic: sort by dominant emotion index in EMOTIONS, then intensity, then name `t01` onward.

`core/music-prompt.ts`:

```ts
export const SOUNDTRACK_BASE: string; // one shared orchestra and leitmotif sentence
export function bpmRange(tempo: number): [number, number];
export function buildTrackPrompt(input: { top: { id: EmotionId; weight: number }[];
  intensity: number; tempo: number }): string; // base plus mood, dynamics, BPM, under 400 chars
```

## Pipeline signatures

Clients are interfaces; orchestration takes them as object args.

```ts
// pipeline/http.ts
export interface RetryOpts { attempts?: number; backoffMs?: number } // defaults 3, backoff
export function isRetryable(status: number | null, error: string): boolean; // network, 429, 5xx
export function fetchWithRetry(fetchFn: typeof fetch, url: string,
  init: RequestInit, opts?: RetryOpts): Promise<Response>;
export function runPool<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]>;

// pipeline/meta.ts
export interface MetaClient { completeJson(input: { system: string; user: string;
  schemaName: string; schema: Record<string, unknown> }): Promise<{ data: unknown;
  promptTokens: number; cachedTokens: number; completionTokens: number }>; }
export function createMetaClient(input: { fetchFn?: typeof fetch; apiKey: string;
  model: string }): MetaClient;
// Empty or unparseable content throws a retryable error. Never logs headers or keys.

// pipeline/jev.ts
export interface JevResult { vector: Vector9; choice: JevEmotionId; confidence: number;
  intensity: number; intensityConfidence: number; tempo: number; tempoConfidence: number;
  model: string; inputTokens: number; outputTokens: number; }
export interface JevClient { classify(input: { book: string; chapter: string;
  sceneTitle: string; scene: string }): Promise<JevResult>; }
export function createJevClient(input: { fetchFn?: typeof fetch; apiKey: string;
  model: string }): JevClient;
export function capSceneText(text: string, limit?: number): string; // default 12000

// pipeline/prices.ts
export const PRICES: { jevInputPer1M: number; metaInputPer1M: number;
  metaCachedPer1M: number; metaOutputPer1M: number };
export function jevCostUsd(inputTokens: number): number;
export function metaCostUsd(input: { prompt: number; cached: number; completion: number }): number;

// pipeline/cache.ts
export function readIfFresh<T>(path: string, textVersion: string): T | null;
  // returns parsed JSON when bookId file exists with same textVersion, else null

// pipeline/ingest.ts, segment.ts, classify.ts, cluster-tracks.ts
export interface StepCtx { bookKey: string; force: boolean; dir: string; } // dir is data/books/oz
export function runIngest(ctx: StepCtx, deps?: { fetchFn?: typeof fetch }): Promise<Book>;
export function runSegment(ctx: StepCtx, deps: { meta: MetaClient }): Promise<Scene[]>;
export function runClassify(ctx: StepCtx, deps: { jev: JevClient; meta: MetaClient }): Promise<void>;
export function runCluster(ctx: StepCtx): Promise<void>;
// runClassify keeps going on hard failures and records error per scene, never a fake vector.
```

`pipeline/build.ts` parses `oz [--step ingest|segment|classify|cluster] [--force]`, loads `.env.local` with guarded `process.loadEnvFile`, runs steps in order, and prints progress plus a final summary (chapters, paragraphs, scenes, dominant emotion counts, override rate, failures, Jev and Meta cost). Only the book key `oz` exists; any other key fails with the valid list.

`pipeline/books.json`: `{ "oz": { "gutenberg": 55, "title": "The Wonderful Wizard of Oz", "author": "L. Frank Baum" } }`.

## Data file shapes

`data/books/oz/book.json`: `{ id, title, author, source: { gutenberg, url }, textVersion, chapters, paragraphs }` per `Book`. `textVersion` is `sha256:` plus hex over `id\ttext` lines joined with `\n`.

`data/books/oz/scenes.json`: `{ bookId, textVersion, scenes: [{ id, ch, start_n, end_n, title, summary, characters }], provenance: { date, meta: { model, requests, prompt_tokens, cached_tokens, completion_tokens, cost_usd } } }`. Scene ids are `c{ch}s{k}` in reading order.

`data/books/oz/analysis.json`: `{ bookId, textVersion, scenes: [...scene fields plus jev/muse_override/final/error], override_rate, provenance: { date, jev: {...}, meta: {...}, total_cost_usd } }`. Meta usage here covers segment plus override calls; total sums Jev and all Meta. Intensity and tempo in `final` are 0 to 1 (score divided by levels minus 1).

`data/books/oz/music-clusters.json`: `{ bookId, textVersion, k, seed, feature_weights, clusters: [{ id, size, centroid: { vector, intensity, tempo }, dominant: [top2], bpm: [lo, hi], scenes, prompt }], unclustered, provenance }`. No network in this step and no audio code anywhere.

## Config changes

Add devDependencies `tsx`, `typescript`, `vitest`, `@types/node` only. Scripts: `test` runs `vitest run`, `typecheck` runs `tsc --noEmit`, `build:book` runs `tsx pipeline/build.ts`; keep existing scripts. Minimal strict `tsconfig.json` (target ES2022, module ESNext, moduleResolution Bundler, strict, noUncheckedIndexedAccess, noEmit, types `["node"]`, include `core` and `pipeline`). Relative imports carry no extensions. Add `'data/books/'` to `IGNORE_PATTERNS` in `scripts/check-file-size.mjs` under the processed book data comment, and extend the size test that covers the list if one exists.

## Test list

All in `vitest`, each `*.test.ts` next to its module:

1. `core/gutenberg.test.ts`: inline CRLF fixture with header, Contents lines, Introduction, two chapters, one `[Illustration]` line; asserts marker strip, dropped front matter, ids, global `n`, chapter ranges.
2. `core/scenes.test.ts`: good coverage passes; gap, overlap, cross chapter, and out of range each report the right code.
3. `core/emotion.test.ts`: override triggers on `unknown`, low confidence, and unknown max; renormalization sums to 1; all zero vector returns null.
4. `pipeline/classify.test.ts`: fake Jev and Meta clients drive one override path and one hard failure path that stores no vector; asserts cost totals match the price table.
5. `core/cluster.test.ts` plus `core/music-prompt.test.ts`: same input twice gives byte identical clusters; k clamps to `min(15, scenes)`; each scene lands in exactly one cluster; every prompt contains the base and stays under 400 chars.
6. Data test: loads committed `data/books/oz/*.json`, skips any file missing, then checks 24 chapters, sequential `n`, full scene coverage, final vectors sum to 1, and every classified scene in exactly one cluster.

## Open choices decided

- Hash in `pipeline` with `node:crypto` over `core.canonicalLines`, because that keeps core free of node imports with no extra plumbing.
- One `pipeline/http.ts` for retry plus pool, because segment and classify need the same policy and one copy is easier to test.
- One `pipeline/meta.ts` client shared by segment and classify, because the endpoint, auth, and usage parsing are identical.
- `capSceneText` keeps the first 6000 and last 6000 chars with a marker, because scene openings and endings carry the mood shift.
- BPM maps tempo linearly to 60 through 160 (`round(60 + tempo * 100)`, range plus or minus 10), because picture book scoring stays inside a playable acoustic range.
- `pipeline/cache.ts` owns the skip if fresh check, because three steps share it and the freeze rule stays in one place.
- Prices live in `pipeline/prices.ts` as plain constants, because costs are pipeline reporting, not domain logic.

## Risks

- Small `max_tokens` can return empty Meta content; the client treats that as retryable and the chapter fails after retries rather than writing a partial scene list.
- Jev `unknown` or low confidence scenes depend on the Meta override; if both fail the scene stays null and ships in `unclustered`, which the summary must show.
- `book.json` is generated (~230 KB) and gitignored from size checks via the new ignore pattern; the freeze flag exists so a text drift fails loudly instead of silently shifting every cache key.
- Chapter title lines vary (extra spaces, mixed case); the heading regex runs on trimmed lines and the ingest test fixture pins the two line shape case plus Contents lookalikes.

Skipped code, fixtures, and the data test data files; Standard model pass only. Risk to know: Jev and Meta response shapes are pinned from the spec sample, so first live run may surface field drift in usage or criteria objects.
