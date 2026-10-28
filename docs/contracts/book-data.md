## Book data

`data/books/oz/book.json` holds the frozen text: id, title, author,
`textVersion` hash, chapters with `start_n` and `end_n`, and paragraphs
with `id`, `ch`, `n`, and `text`. `analysis.json` is the scene source
the reader consumes: the same scenes plus Jev vectors, the Muse
override, and the `final` emotion. `scenes.json` is the pipeline
intermediate that `analysis.json` mirrors. The reader consumes the book
fields, scene ranges and titles, and the `final` vector with intensity
and tempo. It never sees `jev`, `muse_override`, or provenance.
`core/reader.ts` defines `buildReaderModel`, which joins paragraphs to
scenes by ordinal range and throws on unordered scenes or on paragraphs
covered zero or two times. The `resplit` pipeline step (after
`classify`, before `cluster`) cuts candidate scenes into ~100 to 160
word windows, classifies each window with Jev, and splits at the
strongest persistent dominant-emotion shift (auto at margin 0.30,
Muse decides 0.15 to 0.30, none below). The first part keeps the
scene id with letter-suffixed later parts; provenance lands under
`provenance.resplit` in `analysis.json`: one entry per cut (`from`,
`at_n`, `margin`, `window_left`/`window_right` from the window means,
`final_left`/`final_right` from the re-classified parts,
`decided_by`), plus `merged_back` (parts re-classified to the same top
emotion and folded back), `rejected` (Muse declined), and
`window_failures` (Jev failed, scene left whole), `muse_failures` (Muse resplit call or titles failed, scene left whole), and `reclassify_failures` (a part re-classified to null, scene left whole).


Chapter narration (one mp3 plus sentence timings per chapter) is described in [narration](narration.md).
