# Task 26: Chapter cover, chapter-end card, and Chapter in panels

Ports the `.proto/v3` panels look (tile, modal, recap grid, paired
pane control) into the folio reader. Music, player, and
`server/images` are untouched; panels use bundled art or placeholders,
no generation, no network calls.

## What changed

- `core/reader.ts`: `SceneView` carries `isChapterFirst` /
  `isChapterLast`; `subPageCount`, `subPageKind`, `textPageAt` place
  the cover at index 0 and the end page last; `panelCaption` cuts a
  scene summary to its first clause at 90 chars. Tests in
  `core/reader.test.ts`.
- Route `app/leer/[sceneId]/page.tsx`: pager counts include the
  extras; passes the current chapter's panels (`sceneId`, caption,
  bundled art) plus the next chapter's cover target.
- `app/leer/scene-page.tsx`: renders cover, end page, or text from
  the sub-page kind. Cover: kicker, large number, title, rule, panels
  offer, begin button; pane placeholder with no pill. End page:
  kicker, unblurred preview card, next-chapter button (`The end.` on
  the last chapter). Text pages pair the pane pill with a chapter
  half and add a quiet chapter button under a shown picture.
- New `app/folio/panels.ts` (name const, `PANEL_ART`, session spoiler
  sets), `app/folio/panels-modal.tsx` (offer card, quiet link,
  spoiler gate, trapped-focus modal, comic grid, shared Lightbox),
  `app/folio/copy-gates.test.ts` (name-once, no Generated, no
  purple), `app/styles/chapters.css`.
- `app/folio/use-pictures.ts`: read-only `getCachedScenePicture`
  getter; behaviour unchanged.
- Contract delta lives in `docs/contracts/chapter-panels.md`, not
  `docs/contracts.md`.

## Checks

`npm test`, `npx next typegen`, `npm run typecheck`, `npm run build`,
`npm run check:isolation`, `npm run test:hooks`, `npm run check:size`,
the secrets scan.

## Copy table

| Where | String |
|---|---|
| Cover kicker | Chapter |
| Cover number (aria `Chapter N`) | chapter digits |
| Panels offer name | Chapter in panels |
| Offer and gate spoiler line | The whole chapter, told in pictures. It gives away what happens, so you may want to read first. |
| Offer buttons | Show me anyway / I'll read first |
| Cover begin | Begin the chapter → |
| End kicker | End of Chapter N |
| End card title | Relive this chapter in panels |
| End card button | Open the panels |
| End next chapter | On to Chapter N+1 → |
| Last chapter | The end. |
| Pane pill halves | Picture this scene / Picture the chapter |
| Pane group (aria) | Picture choices |
| Quiet button under picture | Picture the chapter |
| Modal header | Chapter N · Title |
| Modal label (aria) | Chapter N, Title |
| Modal close (aria) | Close |
| Panel button (aria) | Panel N: caption |
| Gate label (aria) | Before you look ahead |
| Gate buttons | Show me anyway / Not yet |
