## Cleaning

`core/clean-types.ts` owns the shapes: `RawSection[]` in (id, href,
linear flag, epub types, docTitle, navLabel, heading and plain blocks),
`CleanChapter[]` (title, paragraphs, section ids) plus a `CleanReport`
(kept, removed with rule ids, flagged, merged, LLM cost) out.
`core/clean-rules.ts` holds deterministic rules 1-11 with title
derivation; `core/clean.ts` runs them in order, then one cheap Muse
judge call over ambiguous sections only, then edge trims. The browser
entry point (`parseEpub` in `core/epub.ts`) uses only the sync
`cleanDeterministic` pass over `readEpubSections` output: kept section
titles become chapters and kept paragraphs become words, so the home page
shares the pipeline's front-matter filtering with no LLM. `core/epub.ts`
is the single EPUB reader (guards, DRM, container/OPF/manifest/spine,
nav/NCX labels, blocks); the section reader keeps its injected parser for
Node and defaults to the global DOMParser in the browser. An
`edition-line` rule drops short non-confident sections whose blocks are
mostly edition/rights/print lines. `core/client-safe.test.ts` fails when
`core/clean*.ts` or `core/epub.ts` gains a `node:` import or an env read.
`pipeline/clean-judge.ts` builds the judge from `createMetaClient`;
tests pass fakes, so `core` never touches the network.

Providers: Modal first, Meta fallback. The shared
`pipeline/clean-providers.ts` factory (used by both `build.ts` ingest
and `clean-epub`) reads env only. Modal runs when `MODAL_CLEAN_URL`
(full chat-completions URL, not secret) and `MODAL_CLEAN_TOKEN` are
both set, model `MODAL_CLEAN_MODEL ?? "meta-models/Muse-Spark-Open-816B-A42B"`.
Meta runs when `META_API_KEY` is set, model
`CLEAN_MODEL ?? "muse-spark-1.3-contributor"`. Both set means Modal
primary with Meta fallback; none set throws `no cleaning LLM
configured`. `--no-llm` never reads any of these. Shared Endpoints bill
per token with no idle cost; create one with `modal endpoint create
--shared --name lectoria-clean --model
meta-models/Muse-Spark-Open-816B-A42B`. The judge records `provider`
("modal" | "meta"), model, tokens, per-provider cost, and
`fallbackUsed`. A third provider (Baseten, OpenAI-compatible
`https://inference.baseten.co/v1`) would be one more `url` plus model
entry, not built.

Safety: confident chapter headings skip keyword rules and the judge; a
`non_content` verdict on a long interior section stays kept and flagged;
head/tail cuts clamp to the edge window; judge cuts that only repeat
deterministic removals are skipped, never reported twice. Oz keeps the
txt fallback path and never changes.

CLI: `npm run clean:epub -- <file.epub> [--no-llm]` prints kept titles,
removed counts per rule, and LLM cost, and writes chapters plus the full
report to `pipeline/out/clean/<name>.json`.
