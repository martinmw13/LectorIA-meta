# Task 17: second merge with main (contracts split, light default, chapter panels)

A `git merge origin/main --no-commit` is in progress in this worktree. Only two files conflict. Resolve them, adjust docs to main's layout, keep the diff focused, then commit the merge.

1. `BUILT_DURING_HACKATHON.md`: keep both rows (17 then 27), drop markers.
2. `docs/contracts.md`: take main's version (`git checkout --theirs docs/contracts.md`) and add one bullet `- [Image style](contracts/image-style.md)` right after the Image api bullet. Nothing else changes there.
3. `git mv docs/contracts-image-style.md docs/contracts/image-style.md`. Make its heading `## Image style` like the other split files. Fix any relative links. Keep its content (style field shape, preset list, custom text rules, styled keys, default keys unchanged). Add one line: chapter panels currently only read cached scene pictures (`getCachedScenePicture`); any panel generation sends scene requests carrying one style snapshot for the whole chapter.
4. `docs/contracts/image-api.md`: add one short sentence saying requests may carry an optional `style` field, see [Image style](image-style.md), and that styled keys add a style segment while default keys stay unchanged. Do not reword anything else.
5. `docs/contracts/picture-vault-and-style-pref.md`: replace only the sentences saying the style is UI only / `requestStyleFields` returns `{}` until the contract lands / credit stays Denslow until the adapter sends a style, with: `requestStyleFields` returns `{}` for Denslow and `{ style: { preset } }` or `{ style: { custom } }` otherwise; request bodies spread it; the credit is the preset label or the custom text. Nothing else.
6. Do not touch the light-default theme, panels UI, or any other main code. If any test or check fails because of the merge, fix it minimally in our image-style files.
7. Run: `npm test`, `npx next typegen`, `npm run typecheck`, `npm run build`, `npm run check:isolation`, `npm run check:secrets`, `npm run test:hooks`, `npm run check:size`, `gitleaks git --redact --no-banner`. Never run `next start`.
8. Commit with `git commit --no-edit` style message "Merge latest main into image-style and move the style contract under docs/contracts". Add a RESCUE_LOG.md entry only if you had to rescue something.
