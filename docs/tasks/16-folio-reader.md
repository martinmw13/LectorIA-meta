# Task 16: Folio reader redesign

Ports `.proto/v3/03-folio-margin.html` into the real reader: masthead,
resizable image pane, reading column, Picture Vault margin, folio band.

## What changed

- Shell owns the top line, grid, band, player, and dev panel. The route
  owns the pager, columns, and pictures. Wrappers use `display: contents`.
- Scene pictures live in the left pane with hover expand and lightbox.
  Inline "Picture this" figures sit after the selection end paragraph.
- The vault lists the scene picture plus figures, with jump and expand.
- Style picker is UI only. `requestStyleFields` returns `{}` until the
  `/api/images` style contract lands.
- Orchestra and Piano are sticker buttons. Dev view opens with Shift+D.
- Copy pass from section 9. Old topbar, scene nav, and slot styles are gone.

## Why

The prototype proved the three column folio with a quiet margin. The old
top player bar and inline slot could not hold pictures, style choice, or
the band pager. One grid keeps music state across routes with no portal.

## Checks

`npm test`, `npx next typegen`, `npm run typecheck`, `npm run build`,
`npm run check:isolation`, `npm run test:hooks`, `npm run check:size`,
`node scripts/check-secrets.mjs --all`, plus the two grep gates.

## Copy table

| Where | Before | After |
|---|---|---|
| Scene picture button | Picture scene | Picture this scene |
| Loading | Illustrating… | Sketching… |
| Picture flag | New / Saved | (removed) |
| Dismiss | Dismiss image | Remove picture |
| Music failed note | Music unavailable. The reader works without it. | The music is resting. The book is all yours. |
| MSG_BAD_REQUEST | That request was not valid. Try again. | Something went wrong there. Try again? |
| MSG_QUOTA | You reached your limit of 5 images per day. Come back tomorrow. | That's all five pictures for today. More tomorrow. |
| MSG_BUDGET | The generation limit was reached. Try again later. | The sketchbook is full for now. Try again a little later. |
| MSG_UNAVAILABLE | Images are unavailable right now. | Pictures aren't available right now. |
| MSG_FAILED | Could not generate the image. Try again. | That picture didn't come out. Try again? |
| MSG_RETRY | The image is taking longer than expected. Try again. | This one is taking a while. Try again in a moment. |
| Gallery | (new) | Picture Vault |
| Gallery empty | (new) | Select a line you love, then choose Picture this. Your pictures will gather here. |
