# Task 59: narration boundary and click-to-seek fixes

Repo martinmw13/LectorIA-meta, worktree /workspace/wt-58, branch `narration-boundary` (from latest main, which includes #58 rain duck: `useDuckRamp`, `ambienceDuck`). Read AGENTS.md first and follow every repo rule (co-author trailer via the hook, file-size hook, check:secrets, isolation). No paid API calls, do not touch data/. Only edit app/narration/ (plus new tests there, docs, BUILT_DURING_HACKATHON.md). Do NOT touch app/leer/book-view.tsx (another change follows) beyond what is strictly needed, and do not change the duck/ambience code from #58. Use Node 22 for vitest: prefix commands with `npx -y node@22` or run `npx -y -p node@22 npm test` (the box default is Node 20).

An architecture review found two bugs. Investigate, confirm each with a failing test first, then fix.

## Bug 1: the first scene of a new chapter can be skipped (app/narration/use-narration.ts)
onTime advances to the next scene 0.15 s before the span ends. At a chapter's last scene, the next scene is in another chapter, whose manifest is not cached yet. The scene effect (around line 163-172) clears advancingRef while that manifest is still fetching; if the audio's `ended` fires before the fetch resolves, onEnded advances AGAIN and the new chapter's first scene is skipped.
Required fix:
- Merge the onTime and onEnded advance paths into one `advance()` function.
- Ignore `ended`/`timeupdate` unless `cacheRef.current.get(current.ch)?.key === audio.dataset.key` (the audio playing is the current scene's chapter); on a cache miss do nothing.
- Prefetch the next chapter's manifest when the voice reaches a chapter's last scene (so the boundary usually has no fetch gap). Keep parsing at the trust boundary (parseChapterNarration) and keep the loadToken guard semantics for the current-chapter fetch.
- Within one chapter the audio is continuous: advancing to the next scene in the same chapter must NOT seek to its span start (it just keeps playing). Cross-chapter advances still swap src and seek.
- Regression test: new `app/narration/use-narration.test.tsx` (jsdom, same style as app/folio/use-pictures.test.tsx: createRoot + act). Use a fake audio element (an object/EventTarget or a real HTMLAudioElement with stubbed play/pause/currentTime/paused) and a fetch mock whose response for chapter 2 is held back (a deferred promise). Drive: playing the last scene of ch1, timeupdate near the end, then `ended` before the ch2 fetch resolves, then resolve; assert the controller lands on ch2's FIRST scene and plays from its start. Also test that a within-chapter advance does not write currentTime. The test must fail on current main.

## Bug 2: clicking a word in another scene misplaces the voice (app/narration/read-sync.tsx ~179-207)
The click handler writes audio.currentTime directly from the current chapter manifest. Clicking a word in a later scene: the next timeupdate sees the time past the current scene span and jumps to the next scene start. Clicking an earlier scene: no highlight, because the span gate (line ~86) drops it. Drag-selecting text (e.g. for Picture this) also seeks.
Required fix:
- Add a controller method `seekTo(n: number, t: number)` in use-narration.ts: find the scene containing paragraph ordinal n (startN <= n <= endN), set that scene, and seek to t via the existing pendingSeek path (fresh src seeks on loadedmetadata, kept src seeks at once). The controller must be the only writer of audio.currentTime/src. read-sync calls `seekTo` (pass it in as an option) and never writes the audio element. Handle a click in another chapter sensibly (that chapter's manifest may not be loaded: either resolve the word time once it loads or seek to the scene start; pick the simplest correct one and say which).
- In the click handler return early when `getSelection()?.isCollapsed === false` (drag-select never seeks).
- Delete the dead `registerScene`, `sameScene` and `setOn` (check callers with grep first; replace sameScene usage in toggle with an id comparison).
- Regression tests: later-scene click (scene becomes that scene, time = word t0, no jump to scene start on next timeupdate), earlier-scene click (scene set, highlight not dropped), drag-select (no seek). Put them in a jsdom test (read-sync and/or use-narration test files). They must fail on current main where meaningful.

## Gates
`npm run typecheck`, `npm test` (Node 22), `npm run check:secrets`, `npm run check:size`, `npm run check:isolation`, `npm run test:hooks`, `npm run build` must pass. Then `npx next start -p 3059` in the background, run `python3 scripts/e2e-narration.py http://localhost:3059` and `python3 scripts/e2e-scroll.py http://localhost:3059` (CHROME_PATH may be set), fix failures caused by your change, stop the server.

## Docs
Write docs/tasks/59-narration-boundary.md (short design). Add one line to BUILT_DURING_HACKATHON.md. Do NOT write docs/reviews/59.md (the reviewer writes it). Commit in small logical commits with clear messages (the hook adds the trailer). Do not push.

Use the `ponytail-review` skill on your own diff before finishing. End with: test results, what you skipped and any risk.
