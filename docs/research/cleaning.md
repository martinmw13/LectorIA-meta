# Cleaning research note

Samples: Gutenberg pg11 (Alice), pg63361 (Cottage Folk), pg77472 (Pan's Garden); Standard Ebooks A Christmas Carol. Trimmed fixtures live in `core/fixtures/clean/`. The task brief also records hand findings for Gutenberg pg55, pg54, and Standard Ebooks Oz, which this note takes as given.

## Gutenberg EPUB shape

No `epub:type`, no landmarks, empty guide. Spine order is the only structure: `wrap0000.xhtml` cover (svg only), then `<num>_<book>-h-N.htm.xhtml`. Each file's `<title>` repeats its chapter heading, which makes the title a usable fallback signal.

First file (h-0) holds the header (`#pg-header-heading`, `#pg-machine-header`, `#pg-start-separator`), the title page, and often the Contents table. The last file holds `#pg-end-separator`, `#project-gutenberg-license`, `#pg-footer-heading` (about 2,900 words). The fixture build already strips elements whose id starts with `pg-` or equals `project-gutenberg-license`, so both ends arrive near empty. A rule that drops near empty end sections covers them without pattern matching.

## Junk locations

Front: transcriber notes, title page, imprint cities (Macmillan: "LONDON · BOMBAY · CALCUTTA"), copyright and dedication, prefatory note, contents with page numbers. Cottage Folk h-0 mixes a transcriber note with ads for another novel before the title page. Pan's Garden spreads this over h-1 to h-6: imprint, half title, title page, copyright plus dedication, prefatory note, contents.

Back: ads start inside the last story file, right after "THE END" and the printer line ("Richard Clay & Sons", "Printed by R. & R. Clark, Limited, Edinburgh."). Pan's Garden h-25 to h-31 are author ads ("By ALGERNON BLACKWOOD", "Crown 8vo. 6s.", "net", "MACMILLAN AND CO., Ltd., LONDON"), then a transcriber note, then the license. Alice ends with a bare "THE END" block.

## Reliable signals

Spine position: junk clusters at the very front and very back. `linear="no"` marks non content. Standard Ebooks types are exact: `frontmatter titlepage|imprint|preface|halftitlepage` to drop, `bodymatter chapter` to keep, `backmatter colophon|copyright-page` to drop. Heading text "CONTENTS", "TRANSCRIBER'S NOTE", "THE FULL PROJECT GUTENBERG LICENSE" is stable across samples. Ad bodies repeat price tokens ("6s.", "3s. 6d. net", "Crown 8vo", "In One Volume") and press quote names ("The Spectator", "GLOBE", "TIMES"). Continuation files have no heading, few words ("Holmesly.", "Sussex."), and a `docTitle` equal to the previous story.

## Unreliable signals

Keyword matching alone is unsafe. The Railway Children (pg1874) runs an in story "advertisement" game, so a keyword hit inside a long interior section must not drop it. Headings vary: Alice uses "CHAPTER I. ...", Land of Oz uses bare titles ("Tip Manufactures a Pumpkinhead"), Cottage Folk uses uppercase story names with no chapter word, Carol uses "Stave I" with the title in the nav label ("Stave I: Marley's Ghost"). Oz h-2 starts with the book title as a heading before "Chapter I The Cyclone". Oz h-1 is a real Introduction that the current txt ingest drops by policy.

## Parity check

Oz EPUB body blocks from h-2 to h-25 (non heading, minus `[Illustration...]`) equal the 1104 txt paragraphs in `book.json` exactly, with `<br>` read as space. Standard Ebooks Oz text differs from Gutenberg (modernized edition), so it cannot replace the Oz source.
