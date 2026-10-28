# Task 17: user-selectable image style

Goal: backend plus contract for an image style picker, wired to the
Folio picker. Requests with no style behave byte-identically to today;
styled requests get their own cache keys and prompts.

## What changed

`core/image-style.ts` (new, client-safe: no node imports, no env) owns
the feature: the 9-preset table, `StyleChoice` (wire) and `ImageStyle`
(parsed) types, `normalizeCustomStyle`, `parseStyleChoice`,
`styleSegment` (FNV-1a hash for customs), and `styleDescriptorLine`.
`core/images.ts` accepts an optional `style` body key, keys styled
images under `<base>/<segment>/<file>`, and swaps only the style
sentence in the prompt. The handler maps `ImageStyleError` to 400 with
`MSG_STYLE` ("That style won't work here. Try another?"); orchestration
passes `req.style` through.

The Folio picker (`app/folio/vault.tsx`) stores its choice in
`app/image-style.ts` (`lectoria.imageStyle`). `requestStyleFields`
sends `{}` for Denslow and `{ style: ... }` otherwise;
`requestStyleFields` output is spread into every request body, and
pending re-polls in `app/folio/use-pictures.ts` repost the same body,
so one request never mixes styles. `styleCredit` names the sent style.
The old reader's `picture-panel.tsx` is gone with the Folio redesign,
and with it the `app/image-style-prefs.ts` duplicate: one storage key
only. Full wire details live in `docs/contracts-image-style.md`.

## Choices

One literal denylist with word-boundary matching instead of a pattern
DSL, so each rejected term stays readable. Custom styles hash to
`style-c<16 hex>` so no free text lands in Blob paths or Redis keys,
and the custom text reaches the prompt once, framed as a description
rather than an instruction. The `denslow` preset parses to undefined so
it shares the default cache entries instead of duplicating them.

## Merge with main

Kept main's warm copy, daily spend cap, and credits-out logic; kept
this branch's style parsing, keys, prompt, and handler mapping. Three
sentences left `docs/contracts.md` so it stays under the size hook:
the free-uploads note, the dev-view note, and the theme/fonts note
(all recoverable from code). The 250 ms hover figure went too; the
motion spec says 260 ms.
