Task 17 integration on branch image-style (this worktree). A `git merge
origin/main` is IN PROGRESS with conflicts; finish it. Do not run
`next start` or `next dev`. Never read or print secrets.

Context: this branch adds the server side of a user-selectable image style
(core/image-style.ts, parseImageRequest `style`, styled keys and prompts,
MSG_STYLE). Meanwhile main merged the Folio redesign (PR #21), which already
has a style picker UI in app/folio/vault.tsx and a client pref module
app/image-style.ts (key `lectoria.imageStyle`, pref shape
`{kind:"preset",id}|{kind:"custom",text}`, `requestStyleFields` returning {}
until this contract lands). Main also rewrote image messages in core/images.ts
(warmer copy, MSG_CREDITS_OUT, daily spend key) and the orchestrator.

Do:
1. Resolve conflicts keeping BOTH sides: main's copy, daily spend and
   credits-out logic, plus this branch's style parsing, keys, prompt and
   MSG_STYLE. Set MSG_STYLE to "That style won't work here. Try another?"
   to match main's tone. app/picture-panel.tsx was deleted on main: keep it
   deleted, and delete app/image-style-prefs.ts and its test (one storage key
   only: main's `lectoria.imageStyle`).
2. Wire the client to the contract in app/image-style.ts:
   - STYLE_PRESETS derives id/label from IMAGE_STYLE_PRESETS in
     core/image-style.ts so ids always match the server (labels from core;
     change core's denslow label to "Denslow ink (1900)").
   - parseImageStylePref keeps falling back to DEFAULT_IMAGE_STYLE for
     unknown ids (old saved "watercolour"/"gouache" become default), and
     keeps the 60-char custom cap.
   - requestStyleFields(pref): `{}` for the denslow preset (default keys and
     prompt stay byte-identical), `{ style: { preset: id } }` for other
     presets, `{ style: { custom: text } }` for custom. Type it as
     `{ style?: StyleChoice }`.
   - styleCredit(fields): Denslow credit when no style; preset label for a
     preset; the custom text for custom. Never claim a style not sent.
   - Update app/folio-helpers.test.ts accordingly.
   - In app/folio/use-pictures.ts, when a request gets `pending`, its
     re-polls must resend the same body (check; fix only if not). If an
     error response carries MSG_STYLE, show that message (it already shows
     server messages? check, minimal change).
3. Docs: keep main's docs/contracts.md text intact except: in "Image api"
   change "never text" to say never passage text (custom style text is the
   one exception, validated server-side), and add one short paragraph
   pointing to a new docs/contracts-image-style.md; update main's "Picture
   vault and style pref" paragraph so it no longer says the style is UI
   only (requestStyleFields now sends it). docs/contracts.md must stay under
   the size hook; if tight, shorten only your own lines. Write
   docs/contracts-image-style.md: wire shape, preset table (id, label;
   denslow default), imports (`IMAGE_STYLE_PRESETS`,
   `MAX_CUSTOM_STYLE_CHARS`, `StyleChoice` from `@/core/image-style`),
   custom rules (NFKC, control/format chars to spaces, collapse, lowercase,
   2-60 chars, allowlist letters/numbers/space and `, . ' & -`, denylist
   groups: prompt override, NSFW, people/studios and "in the style of"),
   the 400 bad_request + MSG_STYLE response, storage (`lectoria.imageStyle`
   via app/image-style.ts, sticky, applies to new images only), key layout,
   prompt framing, and the "Chapter in panels" rule (read the style once
   when the panels view opens and send it on every scene request of that
   chapter, including re-polls). Plain and short. Update
   docs/tasks/17-image-style.md and BUILT_DURING_HACKATHON.md (keep both
   sides).
4. Run npm ci only if node_modules is stale, then npm test, npx next typegen,
   npm run typecheck, npm run build, npm run check:isolation,
   npm run check:secrets, npm run test:hooks, npm run check:size. Fix
   failures. Commit the merge through the hook with message
   "Merge main into image-style and wire the Folio picker to the style
   contract" and trailer
   "Co-authored-by: Muse Code (Meta) <muse-code@agents.noreply.invalid>".
