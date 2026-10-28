# Task 49: image style follows the active skin

`app/leer/scene-page.tsx` passed the constant `DEFAULT_SKIN` to
`effectiveImageStylePref`, so with the watercolor or ink skin active the
reader still generated in Denslow. It now reads the live skin with
`useSkin()` from `app/use-skin.ts` and passes that instead; the
`DEFAULT_SKIN` import is gone. Hydration stays safe: `useSkin` returns
the default on the server snapshot and subscribes to the live skin on
mount.

Test: `app/leer/scene-page-skin.test.ts` pins the wiring against the
source (uses `useSkin`, passes `skin`, no `DEFAULT_SKIN` reference, like
`app/rain-button.test.ts`) and checks `effectiveImageStylePref(null,
getSkin())` follows `setSkin("ink")` to pen-pencil and
`setSkin("watercolor")` to watercolor.

Checks: `npm test` (pipeline/ingest.test.ts fails on main too),
`npm run typecheck`, `npm run build`, `npm run check:size`,
`npm run check:isolation`.
