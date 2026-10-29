# Chapter headers, panels

Where this differs from another contract file, this file wins.

## Inline chapter headers

Every chapter opens inline: kicker, number, title, then the Chapter in
panels strip (offer card until read, quiet link after), then its text
at once. No Begin gate. A light "Relive this chapter in panels" entry
closes each chapter; "The end." closes the book. Reading past a
chapter unlocks its panels, like the old end page did.

Music entry still fires once per scene in view (`nextSceneEntry`), so
headers and strip views never trigger a music change of their own. The
chapter jump scrolls to the chapter's first scene.

## Panels data

The route passes every chapter's panels: at most 6 groups from
`chapterPanels` over that chapter's scenes, each a stable key plus a
short caption (`panelCaption` over the group's first summary). Opening
the modal fetches one comic page per chapter (`kind: "chapter"`) in
the reader's current style, cached per chapter and style for the
visit, and shows the captions as an ordered list under the page.

Pages and captions stay behind the spoiler gate until the reader has
reached the chapter. Every route ships the whole book, so the
isolation scan checks each route carries its own scene text rather
than checking for leaks.
