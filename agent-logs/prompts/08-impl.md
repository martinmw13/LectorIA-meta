Implement task 8 (scene by scene reader) on branch `scene-reader` in this workspace. The binding design is `docs/tasks/08-scene-reader.md`; the full spec it came from is below. Read AGENTS.md and SECURITY.md first. Task 6 (soundtracks, Mezclar bandas, Orquesta / Piano, Just play Chopin) and task 7 (Picture this) are already on this branch: keep every one of their controls and tests working. Change the music trigger and the layout around it, not the selection logic.

Skills to apply (read `.agents/skills/<name>/SKILL.md` directly): ponytail (full, in AGENTS.md), typescript-best-practices, principle-type-system-discipline, principle-subtract-before-you-add, principle-test-behavior-not-implementation, principle-prove-it-works, unslop.

Decisions on top of the design:
- `sceneEntryDwellSec: 5` is accepted as a config value with a one-line why; route entries use it. Do not change scoring, hysteresis, overrides or mode logic.
- The layout container must compare scene ids before observing (route params can lag a render). Exactly one `observeScene` per scene entry; zero on sub-page moves; the first scene plays as soon as the manifest lands and the user presses play.
- No `<Link>` to another scene anywhere (prefetch). `router.push` only. The chapter jump is a small native `select` of chapter titles that pushes the first scene of the chapter.
- `/` redirects to the first scene. Unknown scene ids 404 (`dynamicParams = false`).
- The isolation script must fail if a neighbour scene's text appears in the prerendered HTML or RSC payload of a scene route. Add it to package.json (`check:isolation`) and to `.github/workflows/ci.yml` after Build. Run it locally after `npm run build` and show it fails when you temporarily render the next scene (then revert that).
- Styling: existing tokens, Meta blue accent only, quiet buttons like the player's, focus-visible outlines, motion under 200 ms and none with prefers-reduced-motion. Spanish UI copy with correct accents (Capítulo, Página, Escena, Anterior, Siguiente).
- Commit in small logical commits with plain messages (the hook adds the Muse trailer). Do not push. Do not use --no-verify.
- Do not touch `public/music/manifest.json` or any audio file; another worker is replacing them.

Before you finish, run and report: `npm test` (count), `npx next typegen`, `npm run typecheck`, `npm run build`, `npm run check:isolation`, `npm run test:hooks`, `npm run check:size`, `node scripts/check-secrets.mjs --all`, `~/.local/bin/gitleaks dir . --redact --no-banner`. Do NOT start a server (`next start` / `next dev` hang in this sandbox); the isolation script over the build output is the proof.

# Task 8 spec: scene-by-scene reader

Repo: LectorIA-meta, branch `scene-reader`, worktree root is the workspace. Read AGENTS.md and SECURITY.md first; they are binding (core purity, server-only, generic client errors, palette from app/tokens.css, Meta blue accent, never purple, no gradients, desktop only, writing rules, file size hook). Builds on tasks 5, 6 and 7 (docs/contracts.md, docs/tasks/06-soundtracks.md, docs/tasks/07-picture-this.md, core/reader.ts, core/music.ts, core/music-schedule.ts, app/reader.tsx, app/player.tsx, app/player-controls.tsx, app/picture-panel.tsx, app/page.tsx).

## Owner decision (Martin, product owner), overrides the old "continuous scroll" product rules

Continuous scroll is rejected. It spoils: the next scene, with its plot twist, is already on screen, and the music changes by scroll position before you have read the turn. The reader advances scene by scene, like the original Lectoria:

- One scene view at a time. The text of any other scene is never rendered into the DOM, never in the HTML, never in an inline RSC payload, never prefetched. Only the current scene's text ships with the current view.
- Long scenes split into sub-pages inside the scene, by length only (the original used a word budget of about 250 words per page, splitting at paragraph boundaries, a paragraph never split; pick a budget that fits a desktop view without scrolling at the reading measure and say why). A sub-page never contains text from another scene. Every scene starts on a new view.
- Next and previous with the ArrowRight / ArrowLeft keys (ignored while focus is in an input, select, textarea or contenteditable, and with modifier keys) and with visible buttons ("Anterior", "Siguiente"). Next on the last sub-page goes to the first sub-page of the next scene (crossing chapters). Previous on the first sub-page goes to the LAST sub-page of the previous scene. No-op at book start and end, buttons disabled there.
- A progress indicator: chapter number and title, scene k of n in the chapter, sub-page i of m when m > 1. Quiet, small, Spanish.
- Music cue evaluation runs on scene entry only. Moving between sub-pages of the same scene never calls the scheduler and never changes the music. No IntersectionObserver, no scroll listeners, no reading-line logic anywhere. Keep the 06 scheduler (dwell, hysteresis, min track time, overrides, Cambiar track, Mezclar bandas, Orquesta / Piano selector, Just play Chopin) intact; only its trigger changes from "scene became visible" to "reader entered scene". If the dwell timer still makes sense for fast page flipping, keep it and say why in one line; if it delays the cue so long that the reader hears the previous scene's music while reading the new one, propose a shorter scene-entry dwell in the design (config value), do not silently change it.
- The demo scene selector must be able to jump to any scene. Scenes are addressable by URL (one route per scene id is the expected choice) and the reader can jump to a scene id. A minimal chapter jump (Baum's chapter titles, which are the book's table of contents, not spoilers) is enough UI now; the full demo selector is a later task, so expose the jump path cleanly. Do not ship titles or summaries of other scenes to the client: future scene titles can spoil ("You Killed the Wicked Witch"). The client may receive, for all scenes: id, chapter number, and the emotion triple (needed by music); not text, not titles, not summaries.
- Transitions: none or a short fade under 200 ms, off with prefers-reduced-motion. On scene change move focus or scroll to the top of the text so keyboard users stay oriented; announce nothing noisy.
- Picture this (task 7) keeps working: selection inside the current sub-page, and "Ilustrar escena" uses the current scene id from reader state, not from scroll position.
- Remove the continuous-scroll code (app/active-scene.ts and its test, the IntersectionObserver wiring, the sticky-scroll assumptions in CSS that only served scroll). Update AGENTS.md product rules ("The reader uses continuous scroll", "No pagination", "Reading position is the first paragraph visible at the top, tracked with IntersectionObserver") to the new rule in the same terse style, and docs/contracts.md.
- Desktop only. No mobile layout work.

## Expected architecture (the design may improve on it, with one line of why)

- Static route per scene, e.g. `app/leer/[sceneId]/page.tsx` with `generateStaticParams` over all scene ids and `dynamicParams = false`; `/` redirects to the first scene. The page server component builds only that scene's view model (a pure core function, tested): the scene, its chapter, its sub-pages, prev/next scene ids, position counts.
- The music container and player live in a shared layout (e.g. `app/leer/layout.tsx`) so audio and its state persist across scene navigations. The layout receives the slim all-scenes metadata (id, ch, emotion) and reads the current scene id from the route.
- Navigation with `router.push` / `router.replace`, never `<Link>` with prefetch to another scene. Sub-page index lives in client state (or a search param if that stays static-friendly); entering a scene from "previous" lands on its last sub-page.
- Pure pagination in core (`paginateScene(paragraphs, budget)`), tested: no paragraph lost or duplicated, order kept, a single oversize paragraph gets its own page, empty scene gives one empty page.

## Tests (vitest, beside the code; no DOM testing library)

- Pagination and the scene view model (pure).
- Navigation reducer (pure): next/prev across sub-pages, scenes and chapters, landing on the last sub-page when going back, boundaries, jump to scene id, unknown id.
- No next-scene text: for a few scenes, the built or rendered output of a scene route contains that scene's paragraphs and none of the next or previous scene's paragraph text. Pick the cheapest reliable check: a pure test on the view model plus a node script run after `next build` in CI that scans the prerendered HTML and RSC files of a scene route for neighbouring scene text (add it to package.json and the CI workflow).
- Music: a pure test that sub-page moves inside a scene produce no scheduler call and a scene change produces exactly one observeScene call (factor the trigger into a tiny pure function if needed).

## Hard rules

- No new runtime dependencies; no new dev dependencies unless strictly needed (say why).
- Every authored file under 5000 tokens (pre-commit hook). Do not bypass hooks.
- Spanish UI copy, unslopped: no filler, no hype, no em dashes, no emoji.
- Do not touch the pipeline or data/books. Do not touch any other repo.
- Update BUILT_DURING_HACKATHON.md with a 2026-10-27 row for task 8.
- Run `npm test`, `npx next typegen`, `npm run typecheck`, `npm run build`, the new scene isolation check, `npm run test:hooks`, `npm run check:size`, `node scripts/check-secrets.mjs --all`, `~/.local/bin/gitleaks dir . --redact --no-banner`. All green.

## Note for the design only (do not implement)

Owner note: in the original Lectoria each scene had exactly one emotion; segmentation cut at emotion changes, consecutive scenes may share one. The design treats the scene as the emotional unit: sub-pages are for length only and never mean an emotion change. The Oz pipeline prompt already asks for one dominant mood per scene, but it is not verified; do not change the pipeline in this task.
