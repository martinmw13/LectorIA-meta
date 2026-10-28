## Cleaning

`core/clean-types.ts` owns the shapes: `RawSection[]` in (id, href,
linear flag, epub types, docTitle, navLabel, heading and plain blocks),
`CleanChapter[]` (title, paragraphs, section ids) plus a `CleanReport`
(kept, removed with rule ids, flagged, merged, LLM cost) out.
`core/clean-rules.ts` holds deterministic rules 1-11 with title
derivation; `core/clean.ts` runs them in order, then one cheap Muse
judge call over ambiguous sections only, then edge trims.
`pipeline/clean-judge.ts` builds the judge from `createMetaClient`;
tests pass fakes, so `core` never touches the network.

Safety: confident chapter headings skip keyword rules and the judge; a
`non_content` verdict on a long interior section stays kept and flagged;
head/tail cuts clamp to the edge window; judge cuts that only repeat
deterministic removals are skipped, never reported twice. Oz keeps the
txt fallback path and never changes.

CLI: `npm run clean:epub -- <file.epub> [--no-llm]` prints kept titles,
removed counts per rule, and LLM cost, and writes chapters plus the full
report to `pipeline/out/clean/<name>.json`.
