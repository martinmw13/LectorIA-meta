Small UI change in this Next.js/TypeScript repo. Do NOT run git commit. Edit ONLY these files: app/folio/picture-draw.tsx, app/folio/picture-draw-paths.ts, app/folio/image-pane.tsx, app/folio/inline-figures.tsx, app/folio/picture-draw.test.tsx. Do NOT touch any CSS file, app/button-fx.tsx or app/styles/*. Keep the diff minimal and comments short, in the existing style.

GOAL: the "Picture this" loading message (e.g. "Inking a new panel…" + "Usually about twenty seconds") is rendered today INSIDE the picture frame by PictureDraw (the `<div className="picdraw-status">` block at the end of app/folio/picture-draw.tsx). Move it OUTSIDE the frame, as a caption directly below the picture box.

1. app/folio/picture-draw-paths.ts: replace DRAW_STATUS and DRAW_NOTE with warmer copy, no trailing ellipsis:
     export const DRAW_STATUS: Record<PictureSkin, string> = {
       engraving: "Etching the plate",
       watercolor: "Letting the colours bloom",
       ink: "Doodling your scene",
       pencil: "Sketching this moment",
       comic: "Inking a new panel!",
       chihiro: "Painting this moment",
     };
     export const DRAW_NOTE = "Ready in about twenty seconds";

2. app/folio/picture-draw.tsx:
   - Remove the `<div className="picdraw-status">…</div>` from PictureDraw's return (the svg stays; drop the fragment wrapper if it becomes a single child).
   - Export a new small component:
       export function PictureWait({ skin, as: Tag = "p" }: { skin: PictureSkin; as?: "p" | "figcaption" }) {
         return (
           <Tag className="pic-wait" data-picture-skin={skin} role="status">
             <span className="pic-wait-t">{DRAW_STATUS[skin]}</span>
             <span className="pic-wait-dots" aria-hidden="true"><i /><i /><i /></span>
             <span className="pic-wait-n">{DRAW_NOTE}</span>
           </Tag>
         );
       }
     with a one-line comment: the waiting caption that sits under the picture box, outside the frame.

3. app/folio/image-pane.tsx: render `<PictureWait skin={skin} />` as the next sibling AFTER the `<div className="frame">…</div>` element (still inside `<section className="img-pane">`), only when card.phase === "loading". `skin` is already available in that component (it is passed to PictureButton); reuse it.

4. app/folio/inline-figures.tsx: in the `figure.phase === "loading"` branch, render `<PictureWait skin={skin} as="figcaption" />` right after the `<PictureSlot … className="genload" />`, inside the same <figure>. Get the skin with `usePictureSkin()` from "./picture-skin" (same hook PictureSlot uses) — call it at the top of InlineFigureView before any early return so hook order is stable.

5. app/folio/picture-slot.tsx stays unchanged (it keeps role="status" on the slot).

6. app/folio/picture-draw.test.tsx: the first test currently asserts `slot?.textContent` matches "Etching the plate". Change it so it asserts the caption is outside the frame: `host.querySelector(".frame .pic-wait")` is null, `host.querySelector(".img-pane > .pic-wait")?.textContent` matches "Etching the plate" and "about twenty seconds"; and after the card turns ready, `host.querySelector(".pic-wait")` is null. Look at the Harness in that test file to see what it renders (it may render ImagePane); adapt selectors to the real DOM. If any other test in app/ asserts the old strings ("Usually about twenty seconds", "Etching the plate…", "picdraw-status"), update it too (grep first).

When done run: npx vitest run app/folio and npx tsc --noEmit -p . and fix failures. Report a short diff summary.
