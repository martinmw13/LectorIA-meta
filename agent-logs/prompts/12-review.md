Review task 12 on branch music-session against origin/main (read-only review;
do not edit code, do not start a server). Spec: agent-logs/prompts/12-impl.md,
docs/tasks/12-music-session.md and the "Grok Bot review" section already in
docs/reviews/12.md (verify or refute each of its findings).
Check: behavior preserved exactly versus origin/main app/reader.tsx and
core/music-*.ts (switch rules, history push/no-push, replay nonce, entry dwell,
tick scene choice, Previous in playlist mode, style change guard and persist,
track ended, canSkip/canPrev, playlist toggle), identical ranking order, ties
and rng consumption in the collapsed selection path, that dispatch returns the
same object when nothing changed, tests that assert behavior through the
session interface with a fake clock and seeded rng, the 5k-token file-size
limit, security (no secrets, no raw errors to clients, no new endpoints), and
that the contracts doc matches the code. pipeline/, data/ and public/ must be
untouched.
Append a section "## Muse review, round 1" to docs/reviews/12.md with numbered
findings marked Must / Should / Nit, and a final verdict line
"Verdict: clean" or "Verdict: changes needed". Commit only that file.
