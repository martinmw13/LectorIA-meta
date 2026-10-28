# Task 38: heading focus
Bug: programmatic heading focus after scene moves showed Chrome's default ring (wheel counts as focus-visible).
Fix: `#scene-heading:focus, :focus-visible { outline: none; }` in folio.css; buttons/links/inputs keep rings.
Check: opt-in `python3 scripts/e2e-scroll.py [base_url]` (wheel sweep, keys, no errors, heading outline none).
Checks: `npm run typecheck`, `npx vitest run app/folio`.
