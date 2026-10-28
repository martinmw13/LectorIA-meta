## Scene reader

One static route per scene (`app/leer/[sceneId]`, `dynamicParams`
false); `/` redirects to the first scene. The layout mounts the music
container once and passes slim metadata for all scenes: id, chapter,
and emotion triple only. Each scene page builds its view with
`buildSceneView` and ships only that scene's text, its chapter title,
and neighbor ids. Sub-pages come from `paginateScene`, which closes a
page when the next paragraph would pass 250 words or the line budget
(`FIRST_PAGE_LINES` 12 on page one, `LINES_PER_PAGE` 13 after, each
paragraph costing `ceil(chars / CHARS_PER_LINE)` lines with
`CHARS_PER_LINE` 58). Paragraphs that outlast a page split at a
sentence boundary (word fallback); fragments share `n`, later ones
carry `cont`, and rejoin exactly. A two-line chapter title
(`TITLE_CHARS_PER_LINE` 26) costs every page 2 lines. The pager moves sub-pages in client state and
pushes routes with `router.push`, never `<Link>`; going back lands on
the previous scene's last sub-page through a one-shot client flag, never
a URL param, so prerendered pages stay static. The client never
receives other scenes' text, titles, or summaries. One grid holds the
top line, image pane, reading column, vault margin, and bottom band;
route wrappers use `display: contents`, so music state persists across
routes with no portal. The top line reads `LECTORIA`, book and author,
then `Chapter N of 24` as a quiet chapter jump (a native select styled
as text, options `1. The Cyclone`), then the theme toggle. Each page
opens with a kicker `Chapter N`, the chapter title in Newsreader, then
muted `Scene k of n` (plus `Page i of m`); no scene name appears
anywhere. Book type is 20.5px / 1.7, no paragraph gaps, 1.5em indent,
blue drop cap on page one. The body never scrolls at 1280×800; the
reading column scrolls inside itself. The word budget stays the upper
bound and the line budget keeps every sub-page inside 1280×800 without
scroll.

