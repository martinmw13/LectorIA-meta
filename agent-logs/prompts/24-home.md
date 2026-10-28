Task 24 step: share the cleaning pass with the home page's browser EPUB parser.
Same rules as agent-logs/prompts/24-impl.md (read it): no next dev/start, never
read or print secrets, never create .env files, never call a real model,
never run build:book, never touch data/books/oz. Read and follow
`.agents/skills/typescript-best-practices/SKILL.md` and
`.agents/skills/principle-migrate-callers-then-delete-legacy-apis/SKILL.md`
(read the files). Proceed without asking.

## Bug from the owner
Home (task 20, now on main: core/epub.ts, app/home/upload.tsx,
docs/contracts/home.md) shows Alice (Gutenberg 11) with a chapter called
"THE MILLENNIUM FULCRUM EDITION 3.0". parseEpub takes nav/NCX labels and
filters them with its own small `isFrontMatter`; the nav entry for the title
page h-0 carries that edition line. Our cleaning pass already removes h-0
(title-policy), so home must use our deterministic pass instead of its own
filter.

## Do
1. One EPUB reader. Fold core/epub-sections.ts into core/epub.ts (or make
   epub-sections.ts import every guard/helper from epub.ts) so there is one
   copy of: size/entry/inflated guards, PK + mimetype check, DRM check,
   container/OPF/manifest/spine/nav/NCX parsing, resolveHref. Keep
   EpubError + codes + EPUB_ERROR_MESSAGES as they are on main (UI copy
   unchanged). The section reader keeps its injected parser for Node
   (jsdom) and defaults to the global DOMParser in the browser. Remove the
   `shortcut: duplicates task 20` comment once done. Delete whatever
   becomes dead.
2. Make the deterministic pass synchronous and reusable: split
   cleanSections into `cleanDeterministic(bookTitle, sections)` (sync,
   pure, returns chapters + report + the ambiguous section ids) and the
   existing async `cleanSections(bookTitle, sections, judge?)` that calls
   it and then applies the judge. Behavior of cleanSections unchanged
   (all current tests pass untouched, except import paths).
3. parseEpub(bytes) builds its result from readEpubSections +
   cleanDeterministic: `chapters` = kept chapter titles (ambiguous
   sections stay, as today with no LLM), `words` = words in kept chapter
   paragraphs (use the existing WORD_RE counter). Title/author/cover
   unchanged. Delete `isFrontMatter`, navChapters/ncxChapters if unused.
   Keep the 500-chapter cap. Update core/epub.test.ts only where the
   new semantics change an expectation, and explain each change in the
   commit body. app/home/upload.tsx should need no change; if it does,
   keep it minimal.
4. Bundle check: core/clean*.ts and core/epub.ts must stay client-safe (no
   node:* imports, no env). Add a test that greps the import lines of those
   files for "node:" and fails if found (or reuse an existing isolation
   check if the repo has one; look at scripts/ and package.json).
5. Regression fixture + tests:
   - core/clean.test.ts: with the existing core/fixtures/clean/pg11.json,
     no kept chapter title or first paragraph contains "MILLENNIUM FULCRUM"
     or "EDITION"; first kept title is "Down the Rabbit-Hole".
   - Add a small fixture core/fixtures/clean/edition-lines.json (hand-made,
     under 3 KB, same shape as the others) with a front section whose nav
     label and blocks are edition/front-matter lines ("THE MILLENNIUM
     FULCRUM EDITION 3.0", "Second Edition", "Illustrated Edition",
     "Printed in Great Britain", "All rights reserved"), followed by two
     real chapters. Assert it is removed by a deterministic rule (add an
     `edition-line` pattern to title-policy/front rules if needed:
     a non-confident short section (<= 120 words) whose blocks are mostly
     title/author/edition/publisher lines) and never reaches the judge.
   - core/epub.test.ts: an EPUB3 built in-test with fflate (like the
     existing tiny fixtures) whose nav lists "THE MILLENNIUM FULCRUM
     EDITION 3.0" for a title page doc and two chapter docs: parseEpub
     chapters equals the two chapter titles.
6. Update docs/contracts/home.md (one line: chapter list comes from the
   shared deterministic cleaning pass, no LLM in the browser) and
   docs/contracts/cleaning.md + docs/tasks/24-cleaning.md.

Run npm test, npm run typecheck, npm run check:secrets, npm run check:size,
npm run test:hooks, and npm run lint if it exists (Node 22 on PATH). Small
logical commits. End with a short summary listing what parseEpub now
returns for Alice-like input.
