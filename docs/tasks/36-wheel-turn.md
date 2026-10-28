# Task 36: wheel and trackpad turn pages

Bug: wheel/trackpad scrolled nothing; only arrows and a tiny pager moved the fixed-viewport reader.
Cause: the document never scrolls and no wheel handler turned pages; Space/PageDown/ArrowDown unbound.
Fix: `app/folio/scroll-turn.ts` accumulates edge-only wheel deltas (|acc| >= 60 turns, 250 ms inertia lock).
Scene page binds a non-passive wheel listener (skips modals, pinch, horizontal, nested scrollers) and Space/Page keys.
Text pages gain a Turn-the-page / Next-scene / Finish-Chapter cue; the cover hints "or just scroll".
Checks: `npx vitest run app/folio`, `npm run typecheck`.
