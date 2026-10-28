# Task 42: the "Picture this" selection popover never attaches on a chapter's first scene

Repo martinmw13/LectorIA-meta, worktree /workspace/wt-42, branch `popover-cover` (from latest main). Read AGENTS.md first and follow every repo rule (co-author trailer via the hook, file-size hook, check:secrets, isolation). No paid API calls, do not run `next start`, do not touch data/. Another agent is fixing reader scroll code: do NOT touch scroll handling in app/leer/scene-page.tsx (readColRef, scrollTo, wheel/scroll listeners). Another agent owns image-style presets (app/image-style.ts, server/images/*): do not touch those.

## Bug
Since PR #30 the first scene of each chapter (c1s1, c2s1, ...) opens on a chapter-cover sub-page. In app/folio/use-pictures.ts the mouseup `useEffect` reads `viewRef.current` and depends only on `[sceneId]`. On a chapter's first scene it runs while the cover is showing, before the `.body-text` element (`ref={pic.viewRef}` in app/leer/scene-page.tsx) exists, so it returns early and never re-runs when the reader taps "Begin the chapter". Result: selecting text never shows the Picture this popover on c1s1, c2s1... It works on c1s2 and later because the text mounts on first render there.

## Fix (smallest root-cause change)
In use-pictures.ts, track the text element in state through a ref callback, e.g. `const [viewEl, setViewEl] = useState<HTMLDivElement | null>(null)`, and return a stable callback ref `viewRef` (useCallback) that stores the node in a plain ref (still read by `illustratePassage`) and calls `setViewEl`. The mouseup effect uses `viewEl` and depends on `[viewEl]`, so it attaches whenever the text view mounts or remounts. Keep scene-page.tsx's `ref={pic.viewRef}` working as is (a callback ref is a valid `ref`). Keep all existing behaviour and cleanup.

## Regression test
Add app/folio/use-pictures.test.tsx with `// @vitest-environment jsdom`. Render a tiny harness component with react-dom/client `createRoot` + `act` (no new dependencies; set `globalThis.IS_REACT_ACT_ENVIRONMENT = true`) that calls `usePictures` and renders the `<div ref={pic.viewRef}>` with a `<p>` of text ONLY after a `showText` prop flips from false to true (mimics cover -> text). Then select the paragraph text with `document.createRange` + `window.getSelection().addRange`, dispatch a `mouseup` on the div, flush requestAnimationFrame (stub `requestAnimationFrame` to run the callback synchronously if needed), and assert `pic.popover` is not null. The test must fail on the old code. Mock `fetch` is not needed because nothing is requested; if module imports need stubbing, keep it minimal.

## Done when
`npm run typecheck`, `npm test`, `npm run lint` (if present), `npm run check:secrets`, `npm run check:size`, `npm run check:isolation` all pass. Commit with a clear message ("Attach the Picture this popover when the text view mounts"); the hook adds the trailer. Update BUILT_DURING_HACKATHON.md with one short line for task 42. Do not push.
