## Scene reader

One static route per scene (`app/leer/[sceneId]`, `dynamicParams`
false); `/read/oz` redirects to the first scene. The layout mounts the music
container once and passes slim metadata for all scenes: id, chapter,
and emotion triple only. Every route ships the whole book as one
continuous scroll (`app/leer/book-view.tsx`); a deep link scrolls
instantly to its scene section. There are no sub-pages, no page turns,
and no wheel or key hijacking: native scrolling only, with the reading
column focused on load so Space/Page keys work. Each chapter opens
inline with a kicker `Chapter N`, the chapter number and title in
Newsreader, and the Chapter in panels strip, followed at once by its
text; scenes are `section[data-scene-id]` blocks with a light ornament
between them (`content-visibility: auto` keeps the full book smooth).
A light "Relive this chapter in panels" entry closes each chapter and
"The end." closes the book. The scene most in view (one
IntersectionObserver, `pickCurrentScene`) drives the picture card, the
vault, the pager ("scene x of y"), the music session, and the URL via
`replaceState` to `/leer/<sceneId>`; the live id is shared through a
tiny store (`app/leer/current-scene.ts`) because App Router state may
not follow `replaceState`. Chapter jumps and pager moves scroll to the
target section, smooth unless `prefers-reduced-motion`. One grid holds
the top line, image pane, reading column, vault margin, and bottom
band; route wrappers use `display: contents`, so music state persists
with no remounts and no portal. The top line reads `LECTORIA`, book and
author, then `Chapter N of 24` as a quiet chapter jump (a native select
styled as text, options `1. The Cyclone`), then the theme toggle. Book
type is 20.5px / 1.7, no paragraph gaps, 1.5em indent, blue drop cap on
every scene opener. The body never scrolls at 1280×800; the reading
column scrolls inside itself. The isolation scan now checks that every
scene route carries the whole book.

