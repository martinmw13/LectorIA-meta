Review and fix round for task 19 on branch step-freshness (this worktree). Do
not run `next start` or `next dev`. Never print or read secret values. Never
run `npm run build:book` without `--dry-run`.
1. Read docs/reviews/19.md and docs/tasks/19-step-freshness.md, then review
   `git diff origin/main..HEAD -- pipeline data docs`. Look for correctness
   (any sequence of --step/--force runs where a step reuses output that no
   longer matches its inputs, or a normal full run redoes something it
   used to reuse), and test gaps.
2. Fix item 1 of "Grok Bot review (round 0)": include the book textVersion
   in the classify and resplit fingerprints (both where they are computed
   for decide and where steps record them), add a test that a changed
   textVersion with identical scenes redoes classify and resplit, re-stamp
   data/books/oz with a throwaway one-liner (do not commit it) so that only
   analysis.json `provenance.input` and `provenance.resplit.input` change
   value, show an old-vs-new parsed comparison proving nothing else changed,
   and update the docs table. Fix any other Must you find, smallest diff,
   with a test.
3. Append "## Muse review, round 1" to docs/reviews/19.md: findings
   (Must / Should / Nit), what you fixed, and "Verdict: clean" or
   "Verdict: changes needed". Under item 1 of the Grok Bot review append
   "Resolved by <sha>: <one line>".
Run npm test, npm run typecheck, npm run check:isolation, npm run
check:secrets, npm run test:hooks, npm run check:size. If tsx cannot start in
your sandbox, say so; do not work around it. Commit through the hook with
trailer "Co-authored-by: Muse Code (Meta) <muse-code@agents.noreply.invalid>".
Do not commit agent-logs/.
