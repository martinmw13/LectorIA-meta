# 59 · Narration boundary and click-to-seek fixes

Two bugs from the architecture review, both in `app/narration/`. No duck or ambience changes; one added line in `app/leer/book-view.tsx` (`seekTo` wiring).

## Bug 1: a new chapter's first scene could be skipped

`onTime` advances 0.15 s before the span ends. At a chapter's last scene the next scene is in another chapter, whose manifest is not cached yet. The scene effect cleared `advancingRef` while that manifest was still fetching, so an `ended` arriving before the fetch resolved advanced a second time and skipped the new chapter's first scene.

Fix in `use-narration.ts`:

- One `advance()` path for `timeupdate` and `ended`. Both ignore events unless `cache.get(current.ch)?.key === audio.dataset.key`: on a cache miss (or stale audio) they do nothing, so a late `ended` can never double-advance.
- Prefetch: when the voice reaches a chapter's last scene (next scene is in another chapter), its manifest is fetched ahead and parsed at the trust boundary (`parseChapterNarration`). It only fills the cache; status and the current-chapter fetch keep their `loadToken` guard.
- Same-chapter advances no longer seek: chapter audio is continuous, so the voice plays on into the next scene. Cross-chapter advances still swap `src` and seek. A paused advance (chapter ended mid-scene) still seeks to the next span start and resumes.

## Bug 2: clicks in another scene misplaced the voice

The click handler wrote `audio.currentTime` directly. A later-scene click made the next `timeupdate` jump to the next scene start; an earlier-scene click lost the highlight to the span gate; drag-selects (Picture this) also sought.

Fix:

- New controller method `seekTo(n, t?)`: finds the scene with `startN <= n <= endN`, sets it, and seeks through the existing `pendingSeek` path (fresh `src` seeks on `loadedmetadata`, kept `src` seeks at once). The controller is the only writer of `audio.currentTime`/`src`.
- `useReadSync` takes `seekTo` as an option and never touches the audio element. Clicks in another chapter (word time unknown until its manifest loads) seek to that scene's span start. Clicks between words in the loaded chapter stay a no-op, as before.
- The handler returns early on a non-collapsed selection, so drag-select never seeks.
- Deleted dead `registerScene`, `sameScene`, `setOn` (no callers; `toggle` uses an id comparison now).

## Tests

`app/narration/use-narration.test.tsx` (jsdom, stubbed audio, held chapter-2 fetch): boundary keeps the first scene and plays from its start; same-chapter advance writes no `currentTime`; `seekTo` later/earlier moves land in-span with no jump. `app/narration/read-sync.test.tsx`: later/earlier clicks forward `(n, t)` without touching audio; drag-select does nothing. All 7 fail on the pre-fix code.
