Review round 2 of task 12 on branch music-session against origin/main
(read-only; do not edit code, do not start a server). Read docs/reviews/12.md
(Grok Bot review, Muse review round 1, Fix round 1) and
agent-logs/prompts/12-impl.md. Verify each round 1 finding is resolved, that
selectScheduled now matches origin/main's evaluateRandom + pickRandomTrack rng
consumption exactly in every branch (keep-current, hold, draw, empty pools,
null scene, pickRandomTrack wrapper), that the new rng-count test asserts
behavior, and re-check the whole diff for any behavior change, size limit,
and security. Append "## Muse review, round 2" to docs/reviews/12.md with
numbered Must / Should / Nit findings and "Verdict: clean" or
"Verdict: changes needed". Commit only that file.
