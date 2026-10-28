# Task 26: Chapter cover, chapter-end card, and Chapter in panels

Repo martinmw13/LectorIA-meta. Work on the existing branch `chapter-panels` (built on `folio-reader`, task 16, the Folio reader) in the worktree /workspace/wt-26. Read AGENTS.md, docs/contracts.md, docs/tasks/16-folio-reader.md and app/leer/*, app/folio/* first. The prototype is /workspace/wt-26/.proto/03-folio-margin.html (panels tile, panels modal, recap) and .proto/01-folio-carousel.html (paired "Picture scene / Picture chapter" pane control). Port the look, not the code.

## Hard constraints
- Do not modify core/music-* logic, the Player audio logic, or anything under server/images.
- No image generation of any kind, no network calls to image or music providers. Panels use bundled art or placeholders only.
- Never run `next start` or `next dev`. Run tests, typecheck and build only.
- English UI, Meta blue accents only (never purple), desktop only, minimalist.
- No scene names anywhere (no scene titles in the UI). The word "Generated" never appears in user-facing copy.
- The phrase "Chapter in panels" appears exactly ONCE on any screen (never a heading plus the same words in a card).
- Music changes only at scene change: the cover and end page belong to scenes, so they never trigger a music change of their own.
- Keep repo rules: small focused commits, RESCUE_LOG.md if you rescue anything, file-size hook, secrets scan.

## 1. Chapter cover (page 0 of each chapter's first scene)
- The first scene of every chapter gets one extra leading sub-page: the cover. Its text pages shift by one. Do this with a pure core helper (e.g. `subPageCount(sceneId, paragraphsPages, isChapterFirst)` or a `withCovers(views, model)` in core/reader.ts) used by both the route (page counts for navReducer) and ScenePage, with tests: cover is index 0, `enterAtEnd` lands on the real last page, Back from text page 1 returns to the cover, Back from the cover goes to the previous chapter's last page.
- Cover layout in the reading column: kicker "Chapter", a very large number (Newsreader, light, e.g. 7–8rem, the chapter number from parsed data, digits), the chapter title large below it, a thin rule, then the panels offer card, then a primary "Begin the chapter →" button (moves to the next sub-page; ArrowRight works as usual). No "Scene k of n" line and no drop cap on the cover.
- The panels offer card on the cover is spoiler-gated: a row of the chapter's panel thumbnails rendered heavily blurred (filter: blur(10px) saturate(.7), pointer-events none, aria-hidden), with a small eye-off icon, the name "Chapter in panels" once, the line "The whole chapter, told in pictures. It gives away what happens, so you may want to read first.", and two buttons: "Show me anyway" (opens the panels view) and "I'll read first" (collapses the card to a one-line quiet link "Chapter in panels" for this chapter in this session). Prominent but calm: generous size, hairline border, paper background.
- Left image pane on the cover: the paper-grain placeholder with no pill (nothing to picture yet).

## 2. Chapter-end page (trailing sub-page of each chapter's last scene)
- The last scene of every chapter gets one extra trailing sub-page: the chapter end. Same pure helper, tests included.
- Layout: kicker "End of Chapter N", a large card "Relive this chapter in panels" with an UNBLURRED preview strip of the first 3–4 panels (no spoiler risk now), a primary "Open the panels" button, then a quiet "On to Chapter N+1 →" button that goes to the next chapter's cover. Last chapter: "The end." in place of the next link.
- The phrase "Chapter in panels" must not also appear on this page (the card title already says it).

## 3. Panels view
- A modal dialog (role=dialog, aria-modal, aria-label with the chapter title, e.g. "Chapter 1, The Cyclone"), opened from the cover, the end page, or the pane control. Escape and a × button close it; focus returns to the opener; focus is trapped while open.
- Header: "Chapter 1 · The Cyclone" in small caps style, nothing else.
- One panel per scene of the chapter, in order, laid out like a comic page: CSS grid, 3 columns (2 for chapters with ≤4 scenes), 2–3 px ink borders, small gutters, the first panel of each row may span 2 columns for rhythm. The grid scrolls inside the dialog if needed; the dialog fits 1280x800.
- Panel art, in this priority: (a) the scene picture already in the session cache from "Picture this scene" (app/folio/use-pictures.ts `sceneCache`; export a read-only getter, don't change its behaviour); (b) bundled art from a static map `PANEL_ART` in app/folio/panels.ts: c1s2 → /art/panels/cyclone-doorway.jpg, c1s3 → /art/panels/cyclone-house.jpg; (c) a placeholder: paper background with a faint diagonal ink hatch and a tiny pencil glyph, no text label.
- Caption box under or over each panel (cream box, italic serif, small): a short caption from a pure helper `panelCaption(summary)` in core: first clause/sentence of the scene summary, cut at a word boundary to ≤ 90 chars with "…". Test it.
- NO numbered circles. Each panel shows only a tiny faint number (9px, 35% opacity of muted text) in its top-left corner, visible only on hover/focus-within.
- Click a panel with art: open the shared Lightbox. Placeholders are not clickable.
- Data: the route passes the current chapter's panels only (sceneId + caption + art url), built server-side. This deliberately relaxes "the client never receives other scenes' summaries": record in docs/contracts-chapters.md that the client receives the current chapter's short panel captions only, shown behind the spoiler gate, and never other chapters' or full summaries.

## 4. Pane control on other scenes
- On every text page (not the cover, not the end page) the image pane's pill becomes a paired control, one rounded pill with two halves: "Picture this scene" | "Picture the chapter". The left half is the existing scene picture action. The right half opens the panels view; if the reader has not reached this chapter's end page in this session and has not chosen "Show me anyway" for this chapter, it first opens a small spoiler gate dialog: line "The whole chapter, told in pictures. It gives away what happens, so you may want to read first." with "Show me anyway" / "Not yet". (The dialog does not repeat "Chapter in panels".)
- When a scene picture is showing, keep the existing image behaviour (hover expand, lightbox) and put a small quiet "Picture the chapter" text button under the image.

## 5. Copy and docs
- Every new string must be warm, short and plain. Collect every new user-facing string in docs/tasks/26-chapter-panels.md as a table.
- Record the cover/end sub-pages and the panels data in docs/contracts-chapters.md.
- grep gates: no "Generated" in app/ or core/ user strings; no purple hex; "Chapter in panels" occurs once per screen (write a unit test or a simple grep check over the components that render on the same screen).

## Finish
Run npm test, npx next typegen, npm run typecheck, npm run build, npm run check:isolation, npm run test:hooks, npm run check:size, the secrets scan. Commit. No push. End with a short summary of what you did, what you skipped, and risks.

## Docs size note
docs/contracts.md is at the 20000-byte pre-commit cap, and another task is editing it in parallel. Do NOT edit docs/contracts.md. Put every contract change from this task (cover/end sub-pages, panels data, the relaxed summaries rule) in a new file docs/contracts-chapters.md, written as the authoritative addendum that overrides the matching lines in contracts.md.
