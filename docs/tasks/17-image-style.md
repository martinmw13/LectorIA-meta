# Task 17: user-selectable image style

Goal: backend plus contract for an image style picker (the picker UI is
built elsewhere). Requests with no style behave byte-identically to
today; styled requests get their own cache keys and prompts.

## What changed

`core/image-style.ts` (new, client-safe: no node imports, no env) owns
the feature: the 9-preset table, `StyleChoice` (wire) and `ImageStyle`
(parsed) types, `normalizeCustomStyle`, `parseStyleChoice`,
`styleSegment` (FNV-1a hash for customs), and `styleDescriptorLine`.
`core/images.ts` accepts an optional `style` body key, keys styled
images under `<base>/<segment>/<file>`, and swaps only the style
sentence in the prompt. The handler maps `ImageStyleError` to 400 with
the style message; orchestration passes `req.style` through.

The client stores its choice in `app/image-style-prefs.ts`
(`lectoria.imageStyle.v1`); `picture-panel.tsx` snapshots it once per
request and reposts it on every pending re-poll, so one request never
mixes styles.

## Choices

One literal denylist with word-boundary matching instead of a pattern
DSL, so each rejected term stays readable. Custom styles hash to
`style-c<16 hex>` so no free text lands in Blob paths or Redis keys,
and the custom text reaches the prompt once, framed as a description
rather than an instruction. The `denslow` preset parses to undefined so
it shares the default cache entries instead of duplicating them.
