# Review 24-cleaning: book cleaning layer

Source: docs/tasks/24-cleaning.md, agent-logs/prompts/24-*.md. Branch
`cleaning`, diff `origin/main...HEAD`. All code by Muse Code; manager
rounds below. Fixtures came from the research script (RESCUE_LOG row).

Round 1 (manager, after a real run on 7 samples):
1. pg54 lost its last chapter: the license nav label overrode it. Fixed
   with first-nav-label-per-file and pg-markers guards.
2. Tail cut only looked at the last section, so Cottage Folk's ads after
   THE END survived. Fixed with a cross-section tail cut.
3. pg54 contents page and "image001" placeholders were kept, and a title
   block was duplicated. Fixed with contents by cross-reference, a
   placeholder drop and a duplicate-title drop. LLM cuts are deduplicated.

Round 2 (manager, provider steering plus leftovers):
1. Judge goes to Modal (Muse Spark Open, shared endpoint `lectoria-clean`,
   per token, no idle cost) first, then falls back to the Meta API. Env
   names only; the report records provider and fallbackUsed.
2. clean-report.json was written before the drift check. It now comes after.
3. The THE END mark itself is cut.

Home integration (new scope from the owner, not a review round): Alice
showed "THE MILLENNIUM FULCRUM EDITION 3.0" as a chapter. core/epub.ts now
holds the one EPUB reader. parseEpub builds its chapter list from
`cleanDeterministic`, a sync pure pass with no LLM in the browser. There is
a new `edition-line` rule, an Alice regression test, an edition-lines
fixture and a client-safe import test.

Verified by hand: 479 tests, typecheck, secrets, size and hooks pass under
Node 22. Real samples go through the home parser. Alice now starts at
"Down the Rabbit-Hole". The SE titlepage/imprint entries and the pg54
"LIST OF CHAPTERS" entry are gone. The Oz EPUB path matches the txt
path paragraph for paragraph. Oz stays on txt, data/ is untouched and
the textVersion does not change.

Known limits: browser chapter lists keep ambiguous sections, such as the
pg77472 "PAN'S GARDEN" title page and the "Cottage Folk" title section,
because only the pipeline calls the judge. parseEpub now skips a spine
doc it can't read instead of failing the upload.

Verdict: approve.
