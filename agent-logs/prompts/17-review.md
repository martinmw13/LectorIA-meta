Review round 1 for task 17 on branch image-style (this worktree). Do not run
`next start` or `next dev`. Never read or print secrets.

Read AGENTS.md, docs/tasks/17-image-style.md, docs/reviews/17.md and the diff
`git diff origin/main..HEAD`. Review it with ponytail-review and
blast-radius: correctness of default-key backward compatibility, the custom
style sanitiser (prompt injection, control chars, length, denylist), that
custom text never reaches keys or logs, that style errors never leak raw
text, and the client snapshot in app/picture-panel.tsx.

Append a "## Muse review, round 1" section to docs/reviews/17.md in the
existing style (Must / Should / Nit / Fixed / Verdict). Fix every Must and
Should yourself, including item 2 of the Grok Bot review (expand the
docs/contracts.md style paragraph so the picker can be wired from it alone;
keep it plain and short, no AI tells). Mark Grok Bot item 2 as resolved with
the commit. Keep diffs minimal.

Run npm test, npx next typegen, npm run typecheck, npm run build,
npm run check:isolation, npm run check:secrets, npm run test:hooks,
npm run check:size. Commit through the hook with message
"Task 17 review round 1" and trailer
"Co-authored-by: Muse Code (Meta) <muse-code@agents.noreply.invalid>".
