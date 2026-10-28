# Rescue log

Code changes not written by Muse Code. Each has a `Rescue:` commit.

| Date (UTC-3) | Task | File | Change | Why not Muse |
| --- | --- | --- | --- | --- |
| 2026-10-27 | 05 | app/player.tsx | `handleEnded` ignores an element that ends while a fade runs | Found in the live browser check after merge. The loop crossfade starts 3 s before the end, so the outgoing element ends as the fade finishes; it was still marked audible and started a second loop fade, restarting the track. One-line guard; task 05 had used both Muse review rounds. |
| 2026-10-28 | 24 | server/images/env.ts | Blank cap values fall back to the default instead of a zero cap | Muse review round 1 finding; two-line guard after the single allowed round. |
