Review round 2 (last) for task 17 on branch image-style (this worktree). Do
not run `next start` or `next dev`. Never read or print secrets.

Read docs/reviews/17.md, item 4 of "Grok Bot review, after round 1". Fix it:
1. In docs/contracts.md, restore the "Image api" section text exactly as on
   origin/main (`git show origin/main:docs/contracts.md`), then add one short
   paragraph after the cache-key paragraph: requests may carry an optional
   `style`; omitted or `{ preset: "denslow" }` keeps today's keys; styled
   keys add a `style-<id>` or `style-c<hex>` segment; full contract in
   docs/contracts-image-style.md. Also change "The client sends ordinals and
   ids only, never text" to say never passage text (custom style text is the
   one exception, validated server-side).
2. New docs/contracts-image-style.md: wire shape, preset table (id, label;
   denslow = default), import location (`IMAGE_STYLE_PRESETS`,
   `MAX_CUSTOM_STYLE_CHARS`, `StyleChoice` from `@/core/image-style`), custom
   rules (NFKC, control/format chars to spaces, collapse, lowercase, 2-60
   chars, allowlist letters/numbers/space and `, . ' & -`, denylist groups:
   prompt override, NSFW, people/studios and "in the style of"), the 400
   `bad_request` response with MSG_STYLE, storage
   (`lectoria.imageStyle.v1`, `loadImageStyle`/`saveImageStyle`, sticky,
   applies to new images only), key layout, prompt framing, and the
   "Chapter in panels" rule (read the style once when the panels view opens
   and send it on every scene request of that chapter, including re-polls).
   Plain, short, no AI tells.
3. Append "## Muse review, round 2" to docs/reviews/17.md (Fixed / Verdict)
   and mark item 4 resolved.

Run npm test, npm run check:size, npm run check:secrets, npm run test:hooks.
Commit through the hook with message "Task 17 review round 2" and trailer
"Co-authored-by: Muse Code (Meta) <muse-code@agents.noreply.invalid>".
