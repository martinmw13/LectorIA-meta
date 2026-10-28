Task 24 on branch `cleaning` (this worktree). Design only: write two docs, no code.
Do not run `next start` or `next dev`. Do not read or print secret values; never
create .env files. Never run `npm run build:book` (paid APIs). Never touch
data/books/oz. Read `.agents/skills/architect/SKILL.md` and `.agents/skills/unslop/SKILL.md` and follow them (they are user-invocable only, so read the files instead of invoking them). Proceed without asking questions.

## Goal (owner)

A cleaning layer before segmentation that removes everything that is not the
book itself: publisher info, copyright and title pages, tables of contents,
license text, ads for other books, transcriber notes, colophons, "about the
author". A deterministic pass first (EPUB semantics, spine, known patterns),
then one fast cheap LLM call that classifies only the ambiguous sections and
the boundary blocks. Output: cleaned chapters plus a dev-visible report of
what was removed and why. One shared entry point for Library books and user
uploads: EPUB first, the current Gutenberg .txt path stays as fallback. Oz
must not change: `data/books/oz/book.json` textVersion
`sha256:00c257db…` stays as is (Oz keeps the txt path).

## Write

1. `docs/research/cleaning.md`: concise findings from the samples below
   (what each source looks like, what junk appears where, what is reliable
   and what is not). Under 120 lines.
2. `docs/tasks/24-cleaning.md`: the design (types, rules in order, LLM call,
   report shape, entry points, tests, what is out of scope). Under 220 lines.
   Make concrete decisions; the implementer follows it literally.

## Findings (researched by hand; trimmed fixtures are in core/fixtures/clean/)

Samples: Gutenberg EPUB3 pg55 (Oz), pg11 (Alice), pg54 (Marvelous Land of
Oz, 27 MB with images, EPUB2 no-images build 228 KB), pg63361 (Cottage Folk,
Heinemann 1897), pg77472 (Pan's Garden, Macmillan 1912); Standard Ebooks
Oz and A Christmas Carol.

Fixture shape (one JSON per book): `{meta:{title}, sections:[{id, href,
linear, types, docTitle, navLabel, words, blocks:[{text, heading}]}]}`.
`types` = epub:type tokens on body and its top-level section. `blocks` =
leaf block elements (p, div, li, blockquote, h1-h6, td, dt, dd, pre,
figcaption without block children) with whitespace collapsed and `<br>`
as a single space; elements whose id starts with `pg-` or equals
`project-gutenberg-license` already removed. Fixtures keep only a few
blocks per section (first/last ones, short lines, a window around
"THE END"); `words` is the untrimmed count.

Gutenberg EPUB (all PG samples):
- No epub:type, no landmarks, guide empty. Spine: `wrap0000.xhtml` cover
  (svg only), then `<num>_<book>-h-N.htm.xhtml`.
- h-0 holds the PG header (`#pg-header-heading`, `#pg-machine-header`,
  `#pg-start-separator`), title page and often the Contents table.
  Last file holds `#pg-end-separator`, `#project-gutenberg-license`,
  `#pg-footer-heading` (about 2,900 words). With pg- ids removed both are
  near empty.
- Each file's `<title>` repeats the chapter heading. Heading blocks: Oz h-2
  starts with heading "The Wonderful Wizard of Oz" (book title) then
  "Chapter I The Cyclone"; chapter files use `Chapter II<br/>The Council
  with the Munchkins`. Oz h-1 is the Introduction (185 words), which the
  current txt ingest drops. Chapter XXIV is a real 80-word chapter.
- Checked: Oz EPUB body blocks from h-2..h-25 (non-heading, minus
  `[Illustration…]`) equal the 1104 txt paragraphs in book.json exactly
  (with `<br>` as space; `<br>` as newline differs on one verse paragraph).
- Alice: "CHAPTER I. Down the Rabbit-Hole" headings, ends with block
  "THE END". Land of Oz: headings have no "Chapter" word
  ("Tip Manufactures a Pumpkinhead"); h-0 has the author's note + contents.
- Cottage Folk: h-0 = transcriber's note + ads for another novel ("In One
  Volume, Crown 8vo, price 6s.", press quotes "The Spectator.—“…") + title
  page ("London / William Heinemann / 1897 / All rights reserved").
  h-1 CONTENTS with page numbers. Stories h-2..h-9 have uppercase titles
  (no chapter word). Ads start inside h-9, after "THE END" and the printer
  line "Richard Clay & Sons, Limited, London & Bungay.", about 200 blocks
  of book titles, "In One Volume, price 6s." and press quotes. h-10 = more
  ads + transcriber corrections table ("206.15", "Added.").
- Pan's Garden: h-1 Macmillan imprint cities, h-2 half-title, h-3 title
  page, h-4 copyright + dedication, h-5 PREFATORY NOTE, h-6 CONTENTS.
  Tiny continuation files with no heading (h-8 "Holmesly.", h-17
  "Helouan.", h-24 "Sussex." + "Printed by R. & R. Clark, Limited,
  Edinburgh.") are the sign-off of the previous story; their `<title>`
  equals the previous story's. h-25..31 are "By ALGERNON BLACKWOOD" ads
  ("Crown 8vo. 6s.", "net", "MACMILLAN AND CO., Ltd., LONDON"),
  h-32 TRANSCRIBER'S NOTE, h-33 license.
- Keyword matching alone is unsafe: The Railway Children (pg1874) has an
  in-story "advertisement" game.

Standard Ebooks: full semantics. Sections typed `frontmatter titlepage`,
`frontmatter imprint`, `frontmatter introduction|preface
z3998:non-fiction`, `frontmatter halftitlepage`, `bodymatter chapter
z3998:fiction`, `backmatter colophon`, `backmatter copyright-page`. Chapter
headings are just "I" / "Stave I"; the nav label carries the title
("I: The Cyclone", "Stave I: Marley’s Ghost"). Text differs from Gutenberg
(modernized edition), so SE Oz is not a drop-in source for Oz.

Existing code to reuse: `core/gutenberg.ts` (stripGutenberg, splitChapters,
buildBook, canonicalLines), `pipeline/ingest.ts` (runIngest, textVersion
drift check), `pipeline/meta.ts` (createMetaClient: json_schema strict,
returns token usage), `pipeline/prices.ts` (metaCostUsd).
A home page branch (task 20, not merged yet) adds `core/epub.ts`: a
client-safe parser with fflate 0.8.3 `unzipSync` + platform DOMParser,
MAX_EPUB_BYTES 20 MB, EpubError codes, a zip-bomb guard (8 MB per entry,
60 MB inflated), DRM detection, OPF/nav/NCX parsing, but it returns only
title, author, chapter titles, word count and cover. Design the EPUB
section reader so it can live in that file once it lands (same deps, same
guards); until then a new `core/epub-sections.ts` with the DOM parser
injected as an argument (jsdom 30.1.3 devDep in Node, DOMParser in the
browser).

## Design direction (decide details, keep the spirit)

- `core/clean.ts` is pure (AGENTS.md: no env, no network). Input: book
  title + RawSection[] (fixture shape minus `words`). The LLM is injected
  as a `judge` function; tests use fakes.
- Deterministic rules, in order, each removal recorded with rule id and
  reason: linear="no"; epub:type frontmatter/backmatter (and the specific
  types) removed, bodymatter/chapter kept as confident content; empty or
  heading-only sections; PG license/markers; title patterns (contents,
  transcriber's note, advertisements, colophon, copyright, index, also
  by, about the author, preface/introduction/foreword/prefatory note:
  removed by policy, matches today's Oz); contents-like bodies (short lines
  with page numbers); ad-like bodies (prices "6s.", "net", "Crown 8vo",
  "In One Volume", press quotes, publisher address lines) above a share
  threshold; continuation merge (no heading, few words, same docTitle as
  the previous kept section); chapter-heading regex = confident content.
  Inside content: drop heading blocks from paragraphs (they make the
  title), drop `[Illustration…]`, cut after the last "THE END"/"FINIS"
  in the last content section, drop trailing printer lines.
- Everything not decided goes to ONE LLM call per book: each ambiguous
  section as id + title guess + word count + first/last blocks
  (truncated), plus the first blocks of the first content section and the
  last blocks of the last one with indexes. Strict JSON: per-section
  verdict content | non_content | uncertain with a kind and a short
  reason; head and tail cut counts. Safety: uncertain and missing ids are
  kept and flagged; never drop a long interior section on the LLM's word
  alone (keep + flag); clamp cuts; on LLM failure keep the deterministic
  result and record `llm: failed` (no raw error). Book text is untrusted
  data in the prompt (prompt injection from uploads).
- Title derivation: first heading block that is not the book title, minus
  a leading label (Chapter/Stave/Book/Part + numeral, or bare numeral);
  if only a label remains use the nav label's text after ":".
- Report: source, kept chapters (title, paragraph count, section ids),
  removed (section or block range, kind, reason, rule or llm, words,
  short preview), flagged, merged, llm usage (model, tokens, costUsd) or
  null.
- Entry points: `cleanSections` (core), an EPUB section reader (core,
  client-safe), the Gutenberg txt path wrapped to return the same
  {chapters, report} shape with zero LLM calls and exactly today's
  splitChapters output, `pipeline/ingest.ts` choosing EPUB when the book
  config says so (Oz stays txt), and a dev CLI
  `npm run clean:epub -- <file.epub> [--no-llm]` that prints a summary and
  writes the full report JSON to `pipeline/out/clean/` (gitignore it).
- LLM: Muse Spark via META_API_KEY with `createMetaClient`, model
  `CLEAN_MODEL ?? "muse-spark-1.3-contributor"`. No Baseten key exists; note
  that Baseten Model APIs are OpenAI-compatible
  (`https://inference.baseten.co/v1`, Bearer BASETEN_API_KEY), so a
  Llama 4 Scout judge is a base URL + model swap later. Do not build it.
- User uploads: the browser can run the deterministic pass; the LLM pass
  needs a server route with spend guards, which is out of scope here.

Commit both docs: "Add cleaning research note and task 24 design".
