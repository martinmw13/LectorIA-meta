# Rescue log

Code changes not written by Muse Code. Each has a `Rescue:` commit.

| Date (UTC-3) | Task | File | Change | Why not Muse |
| --- | --- | --- | --- | --- |
| 2026-10-27 | 05 | app/player.tsx | `handleEnded` ignores an element that ends while a fade runs | Found in the live browser check after merge. The loop crossfade starts 3 s before the end, so the outgoing element ends as the fade finishes; it was still marked audible and started a second loop fade, restarting the track. One-line guard; task 05 had used both Muse review rounds. |
| 2026-10-28 | 24 | server/images/env.ts | Blank cap values fall back to the default instead of a zero cap | Muse review round 1 finding; two-line guard after the single allowed round. |
| 2026-10-28 | 25 | core/music-session.ts | Previous resolves history through the audible scope, not the current style | Muse review round 1: style scoping changed Previous after a style switch; restoring old behaviour while keeping the playlist-only fix. |
| 2026-10-28 | 24 cleaning | core/fixtures/clean/*.json | Trimmed EPUB section fixtures extracted from Gutenberg/Standard Ebooks samples by the research script | Data extracted by a script, not code; Muse wrote all cleaning code |
| 2026-10-28 | Muse attribution | README.md, docs/MUSE.md, scripts/muse-stats.mjs, .github/workflows/muse-*.yml | Built with Meta Muse section, generated Muse stats page, Muse Code PR label | Docs and CI only; owner split: Cursor does tests, docs and small fixes |
| 2026-10-28 | 41 | app/narration/use-narration.ts, context.tsx, app/reader.tsx | The voice advances to the next scene itself; dropped SceneSync and onAdvanceScene | Grok Bot review after round 2: SceneSync re-seeked the voice to whatever scene the reader scrolled to, and was declared inside Reader so it remounted every render; advanceScene scroll-jumped on every scene change. Both Muse rounds used. |
| 2026-10-28 | 41 | app/narration/read-sync.tsx | Word mark adds the column's scroll offset | Found by the e2e check: the overlay sat thousands of px off screen once the column scrolled. One-line fix after both rounds. |
| 2026-10-28 | 41 | app/tokens.css | Mark colour tokens keyed on real skin ids (watercolor/chihiro, ink/comic) | Tokens used treatment names as skin ids, so ink drew a white circle and chihiro had no sienna. Selector-only fix. |
| 2026-10-28 | 41 | app/narration/duck.ts | Linear duck ramp so the music is fully back within 800 ms | e2e showed the exponential step still at 85% after 1.5 s. |
