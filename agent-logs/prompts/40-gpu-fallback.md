Task 40 follow-up (small). Modal has no L4 capacity right now and narrate calls sit "waiting to be scheduled" for >10 min.

1. pipeline/modal/narrate.py: change `gpu="L4"` to a fallback list `gpu=["L4", "A10G", "T4"]` (Modal tries them in order). Nothing else in that decorator.
2. core/narration.ts: the per-second rate used for spend caps must stay conservative across that list. Rename KOKORO_L4_USD_PER_SEC to KOKORO_GPU_USD_PER_SEC = 0.000306 (A10G, about USD 1.10/h, the most expensive of the three) and update its comment; update all callers and tests.
3. docs/contracts/narration.md: one sentence noting the GPU fallback list and that caps use the A10G rate.
Keep the diff tiny. Run npm test and npm run typecheck. Commit with a clear message (the hook adds the co-author trailer). Do not run next start.
