# Task 49: image style ignores the active skin (bug)

AGENTS.md rules apply. Never run next start/dev. Do not push. Do not touch the music module.

Bug: app/leer/scene-page.tsx (~line 101) passes the constant `DEFAULT_SKIN` to `effectiveImageStylePref`, so with the watercolor or ink skin active the reader still generates in Denslow. Fix: read the live skin with `useSkin()` from app/use-skin.ts and pass it instead; drop the now-unused DEFAULT_SKIN import. Keep the hydration-safe behaviour (useSkin returns DEFAULT_SKIN on the server snapshot).

Add a test that fails before the fix: follow the existing test style in app/ (e.g. folio-helpers.test.ts and rain-button.test.ts). A behavioural test is preferred if the repo already renders components in tests; otherwise a source-pinning test that scene-page derives the pref from useSkin() and no longer references DEFAULT_SKIN, plus a unit check that effectiveImageStylePref(null, getSkin()) follows setSkin("ink").

Write docs/tasks/49-image-style-skin.md (short, same format as other task files) and add the BUILT_DURING_HACKATHON row. Run npm test (pipeline/ingest.test.ts failing locally is pre-existing), typecheck, build, check:size, check:isolation. Small focused commits.
