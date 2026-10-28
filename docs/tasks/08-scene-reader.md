# Design: task 8 scene by scene reader

Goal: replace continuous scroll with one scene view at a time, so the next plot turn never sits on screen and music changes only on scene entry. Branch `scene-reader`. This step writes only this doc.

## Owner decision

Continuous scroll is rejected. It shows the next scene before its turn and moves the music by scroll position.

## Route and file layout

```text
app/page.tsx                redirect to /leer/<first scene id>
app/leer/layout.tsx         server shell, slim meta, mounts music container
app/leer/[sceneId]/page.tsx server view, one scene only, generateStaticParams
app/leer/scene-page.tsx     client pager, keys, buttons, progress, focus
app/reader.tsx              music container, driven by route scene id
app/player.tsx              unchanged audio engine
app/player-controls.tsx     unchanged buttons from task 6
core/reader.ts              pagination, scene view, nav reducer, entry check
scripts/check-isolation.mjs post build scene isolation scan
```

`/` redirects server side to the first scene id. Choice: one address per scene keeps jumps and the demo selector trivial.

## Pure core pieces

All pure logic lives in `core/reader.ts`. Choice: it already owns scene shapes, so no new module is needed.

```ts
export interface SubPage { paragraphs: ReaderParagraph[]; startN: number; endN: number; words: number; }
export function paginateScene(paragraphs: ReaderParagraph[], budgetWords: number): SubPage[];

export interface SceneView {
  sceneId: string; ch: number; chapterTitle: string; title: string;
  emotion: SceneSignal | null; pages: SubPage[];
  prevSceneId: string | null; nextSceneId: string | null;
  k: number; n: number;
}
export function buildSceneView(model: ReaderModel, sceneId: string, budgetWords: number): SceneView;

export interface NavState { sceneId: string; page: number; }
export type NavAction =
  | { kind: "next" } | { kind: "prev" }
  | { kind: "goto"; sceneId: string; atEnd?: boolean };
export interface NavIndex { order: string[]; pageCounts: Map<string, number>; }
export function navReducer(state: NavState, action: NavAction, index: NavIndex): NavState;

export function isSceneEntry(prevSceneId: string | null, nextSceneId: string): boolean;
```

`paginateScene` splits by word count at paragraph boundaries and never splits a paragraph. An oversize paragraph takes its own page. An empty scene returns one empty page. Choice: boundary only rule keeps emotion uniform inside a scene.

`buildSceneView` throws on unknown scene id. Choice: fail loudly at build time so a bad id never ships an empty page.

`navReducer` crosses chapters through the global scene order. Next on the last sub-page enters the next scene at page 0. Prev on the first sub-page enters the previous scene at its last page. Bounds are no-ops. Unknown goto id keeps state. Choice: a reducer keeps every move in one testable place.

`isSceneEntry` returns true only when the scene id changed. Choice: one predicate lets the container prove that sub-page moves never touch the scheduler.

## Page budget

Budget is 250 words per sub-page. Oz averages 35 words per paragraph and 8.3 paragraphs per scene, so most scenes fit one or two views and the longest fits about three. 250 words fill a desktop view at the 65ch measure without scroll.

## Where state lives

Scene id lives in the route and is the only source of truth. Sub-page index lives in client state inside `scene-page.tsx`, keyed by scene id so it resets on entry. "Enter at last sub-page" travels as `?at=end`, set only by the Prev button through `router.push`, read once on mount. Choice: intent stays in the URL because back and forward then land on the same sub-page.

## Layout and audio persistence

`app/leer/layout.tsx` mounts the music container once, so its state and the audio elements survive scene navigations. The container reads the current scene id with `useParams` inside `app/reader.tsx`. The scene page passes only the current signal down as a prop. Choice: params in the client container avoid threading ids through server props on every move.

Navigation uses `router.push` and `router.replace` only, never prefetched links. Choice: no prefetch keeps other scenes out of the client cache.

## What data reaches the client

The layout receives slim meta for all scenes: `{ id, ch, emotion }` plus the chapter table `[{ ch, title }]`. The scene page receives current scene text and title only. No other scene text, titles, or summaries ship. Choice: titles can spoil, but the scheduler needs every emotion vector and the jump needs chapter titles.

## Keyboard and focus

ArrowRight moves next, ArrowLeft moves prev. Keys are ignored with modifier keys and while focus sits in an input, select, textarea, or contenteditable element. Buttons read "Anterior" and "Siguiente" and disable at book start and end. On scene change focus moves to the text heading and the view scrolls to top. No announcement. Choice: silent focus keeps keyboard users oriented without noise.

## Progress indicator

Small quiet line above the text: "Capitulo C, title. Escena k de n. Pagina i de m", with the page part only when m is above 1. Choice: chapter titles are the table of contents, not spoilers.

## Music trigger and dwell

Scene entry calls `observeScene(state, sceneId, signal, manifest, nowSec, env)` exactly once, gated by `isSceneEntry`. Sub-page moves call nothing. The 1 s `tickScheduler` timer stays to settle dwell. Selection logic is untouched. New config `sceneEntryDwellSec: 5` replaces the 20 s dwell for deliberate route entries. Choice: 5 s absorbs a double pressed Next but still cues inside the first sub-page.

## Picture this changes

Passage selection reads the current sub-page DOM as today and needs no logic change. "Ilustrar escena" takes the scene id from the route prop, and the `pickActiveScene` DOM scan in the panel goes away. Choice: the route already knows the scene, so scanning the DOM can only pick wrong.

## What gets deleted

`app/active-scene.ts` and its test, the IntersectionObserver wiring in `app/reader.tsx`, the stacked section divider CSS, and scroll only sticky rules. The sticky player bar and companion panel stay. Choice: delete the scroll machinery in the same task so dead code never invites reuse.

## AGENTS.md and contracts edits

AGENTS.md product rules: replace the three scroll lines with "The reader shows one scene at a time. Sub-pages split long scenes by length only. Music cues run on scene entry." `docs/contracts.md`: reader section becomes route per scene, slim meta, current text only; music section notes the entry trigger and `sceneEntryDwellSec`; image section notes the scene id source. `BUILT_DURING_HACKATHON.md` gains a 2026-10-27 row for task 8.

## Scene isolation check

`scripts/check-isolation.mjs` runs after `next build` in CI and in `package.json`. It picks a few scenes, takes excerpts from neighbor scene paragraphs, and scans the prerendered HTML and RSC files of each scene route for those excerpts. Any hit fails the build. Choice: built files are the real guarantee, since a pure view test cannot see payload leaks.

## Test list

Vitest beside the code, no DOM library. Pagination: order kept, zero loss or duplication, oversize paragraph alone, empty scene one page, never crosses scenes. View model: chapter counts, prev and next ids, unknown id throws, no neighbor text in pages. Reducer: next and prev across sub-pages, scenes, and chapters, back lands last, bounds no-op, goto with `atEnd`, unknown id keeps state. Music: sub-page moves schedule nothing, scene entry calls `observeScene` once, first scene plays at once. Isolation: pure view test plus the post build scan. Prefs and scheduler tests from task 6 stay green.

## Risks

Route params in the layout container can lag one render behind the new page, so the container must compare ids before observing. The `?at=end` param needs a Suspense boundary around the pager. Static output grows with 133 scene routes, so the build must stay static only with no per request code.
