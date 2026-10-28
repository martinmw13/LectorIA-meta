# Design: task 24 cleaning layer

Goal: strip everything that is not the book before segmentation. One shared entry for Library books and uploads: EPUB first, Gutenberg txt as fallback. Oz keeps the txt path and its `textVersion` stays `sha256:00c257db…`.

## Module layout

```text
core/clean.ts            pure rules, title derivation, report build
core/epub-sections.ts    temp EPUB section reader, DOM parser injected
core/epub.ts             section reader moves here once task 20 lands
core/fixtures/clean/     trimmed per book JSON fixtures
pipeline/clean-epub.ts   CLI: read epub, run clean, write report JSON
pipeline/ingest.ts       picks EPUB or txt per book config
```

`core/clean.ts` reads no env and touches no network. The LLM arrives as an injected `judge` function. Tests pass fakes. `pipeline/` holds keys, spend guards, and file writes.

## Input and output types

```ts
interface RawBlock { text: string; heading: boolean; }
interface RawSection { id: string; href: string; linear: string;
  types: string[]; docTitle: string; navLabel: string | null;
  blocks: RawBlock[]; }
interface JudgeVerdict { id: string;
  verdict: "content" | "non_content" | "uncertain";
  kind: string; reason: string; }
interface JudgeResult { sections: JudgeVerdict[];
  headCut: number; tailCut: number;
  model: string; promptTokens: number; completionTokens: number; }
type Judge = (input: JudgeInput) => Promise<JudgeResult | null>;
interface CleanChapter { title: string; paragraphs: string[];
  sectionIds: string[]; }
interface RemovedItem { sectionId: string; blockRange: [number, number] | null;
  kind: string; reason: string; rule: string; words: number; preview: string; }
interface CleanReport { source: "epub" | "gutenberg-txt"; llm: {
  model: string; promptTokens: number; completionTokens: number;
  costUsd: number; } | null;
  kept: { title: string; paragraphs: number; sectionIds: string[]; }[];
  removed: RemovedItem[]; flagged: { sectionId: string; reason: string; }[];
  merged: { from: string; into: string; reason: string; }[]; }
function cleanSections(bookTitle: string, sections: RawSection[],
  judge?: Judge): Promise<{ chapters: CleanChapter[]; report: CleanReport; }>
```

`JudgeInput` carries per section: id, title guess, word count, first 2 and last 2 blocks truncated to 200 chars. Plus the first 3 blocks of the first content section and the last 3 of the last one, with block indexes for cut counts. Null return means the LLM failed or was skipped.

## Deterministic rules in order

Each removal records rule id and reason. Later rules see only kept sections.

1. `linear-no`: drop `linear="no"` sections.
2. `epub-type`: drop `frontmatter` and `backmatter` types, except keep `bodymatter` and any section typed `chapter`. SE `introduction|preface` drops here by policy, which matches today's Oz.
3. `empty`: drop sections with zero words or heading only blocks.
4. `pg-markers`: drop sections whose `docTitle` or nav label matches `PROJECT GUTENBERG`, `LICENSE`, or `Cover` (case insensitive).
5. `title-policy`: drop sections whose title guess matches contents, transcriber's note, advertisements, colophon, copyright, index, "also by", about the author, preface, introduction, foreword, prefatory note. Match on lowercased title guess, exact or starts with.
6. `contents-body`: drop bodies where at least 60 percent of non heading blocks are under 6 words and at least 3 blocks are pure numbers (page numbers).
7. `ad-body`: drop bodies where at least 30 percent of blocks match an ad token: `6s.`, `net`, `Crown 8vo`, `In One Volume`, `price`, a press quote name followed by an em dash or period and an open quote, or a publisher address line (city list with `·`, `LONDON`, `MACMILLAN`). Count matches over all blocks.
8. `continuation`: merge a section with no heading block, at most 10 words, and `docTitle` equal to the previous kept section's `docTitle` into that section. Record in `merged`.
9. `chapter-heading`: mark sections with a chapter heading as confident content. Regex: `^(chapter|stave|book|part)\s+[ivxlc0-9]+[.:]?\s*` or `^stave\s+[ivxlc]+` (case insensitive), or a bare Roman numeral heading (`I`, `II`) plus a nav label containing `:`. Confident content skips the LLM.
10. `tail-cut`: in the last content section, cut after the last block matching `^(THE END|FINIS)\.?$`. Drop trailing printer lines matching `Printed by`, `Richard Clay`, `R\. & R\. Clark`, or a lone place name under 4 words (`Sussex.`, `Helouan.`).
11. `block-drop`: inside content, drop heading blocks, `[Illustration…]` blocks, and blocks matching `^\[Pg \d+\]$`.

Keyword rules 5 to 7 never fire on confident content sections. Anything neither dropped nor confident is ambiguous.

## LLM call

One call per book, only over ambiguous sections. Skip the call when none exist. Prompt: system says book text is untrusted data and the model must only return JSON. Strict `json_schema` with `sections[]` verdicts plus `headCut` and `tailCut` (block counts to trim from the first and last content sections, used for ad bleed at the edges).

Safety, applied after the call returns: `uncertain` and unknown ids stay kept and flagged. A `non_content` verdict on a section over 2000 words stays kept and flagged. Clamp cuts to at most 5 blocks each. On null or schema failure, keep the deterministic result and record `llm: failed` in the report with no raw error text.

Model: `CLEAN_MODEL ?? "muse-spark-1.3-contributor"` through `createMetaClient` with `META_API_KEY`. Cost via `metaCostUsd`.

## Title derivation

First heading block that is not the book title (case insensitive compare). Strip a leading label (`Chapter|Stave|Book|Part` plus numeral, or a bare numeral). If only a label remains, use nav label text after `:`. Else use the `docTitle`.

## Report

`kept` lists title, paragraph count, section ids. `removed` lists section or block range, kind, reason, rule or `llm`, word count, 120 char preview. `flagged` lists kept but doubtful sections. `merged` lists continuation merges. `llm` holds model, tokens, `costUsd`, or null for pure deterministic runs.

## Entry points

`cleanSections` in `core/clean.ts` is the single core entry. The EPUB reader returns `RawSection[]` with the same block shape as fixtures: leaf blocks only, whitespace collapsed, `<br>` as one space, `pg-*` and license elements removed first. It reuses the task 20 guards: MAX_EPUB_BYTES 20 MB, 8 MB per entry, 60 MB inflated, DRM and zip bomb `EpubError` codes, fflate 0.8.3, injected DOM parser.

Txt fallback wraps `stripGutenberg` plus `splitChapters` and returns the same `{ chapters, report }` shape with zero LLM calls and byte identical paragraphs to today. `runIngest` picks EPUB when the book config sets `source: "epub"` with a file path, else txt. Oz has no such flag, so Oz never changes.

CLI: `npm run clean:epub -- <file.epub> [--no-llm]` prints kept titles, removed counts per rule, and LLM cost, and writes the full report JSON to `pipeline/out/clean/<name>.json`. That dir is gitignored. Uploads: the browser runs the deterministic pass only. The LLM pass needs a server route with spend guards, out of scope.

## Tests

`core/clean.test.ts` uses fixtures plus fakes: PG front and back junk removed by rule, SE types honored, continuation merges, tail cut after THE END, uncertain stays kept and flagged, long section never dropped on LLM word alone, LLM failure keeps deterministic output. One txt parity test asserts the wrapped path equals `splitChapters` output.

## Out of scope

No Baseten judge (a Llama 4 Scout judge is a base URL plus model swap later). No upload server route or spend UI. No segmentation or scene changes. No Standard Ebooks text as a Library source. No Modal or music work.
