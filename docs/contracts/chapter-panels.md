# Chapter covers, end pages, panels

Where this differs from another contract file (for example the
scene reader's "no other scenes' summaries" rule), this file wins.

## Cover and end sub-pages

The first scene of every chapter carries one extra leading sub-page,
the cover (index 0; text pages shift by one). The last scene of every
chapter carries one extra trailing sub-page, the chapter end. Both
belong to their scene: `core/reader.ts` (`subPageCount`,
`subPageKind`, `textPageAt`, flags on `SceneView`) shifts indexes only.
The route builds pager counts with the extras, so `navReducer` crosses
them with no new rules: Back from text page 1 returns to the cover,
Back from the cover lands on the previous chapter's last page, and
`enterAtEnd` lands on the real last page.

Music entry still fires once per scene route id (`nextSceneEntry`),
so the cover and the end page never trigger a music change of their
own. The chapter jump lands on the chapter's first scene id, which
opens on its cover (page 0).

## Panels data

The route passes the current chapter's panels only: per scene,
`sceneId`, a short caption (`panelCaption` over the scene summary,
first clause, 90 chars max), and bundled art url or null. Panel art
resolves client-side in this order: the session scene-picture cache
(read-only getter over `app/folio/use-pictures.ts`), bundled
`PANEL_ART` (`c1s2`, `c1s3`), else a text-free placeholder.

This relaxes one line of the scene-reader contract: the client
receives the current chapter's short panel captions only, shown behind
the spoiler gate (or after the end page), and never other chapters' or
full summaries. No other scene text, titles, or summaries ship. The
isolation scan still holds: captions come from summaries, never from
neighbor paragraphs.
