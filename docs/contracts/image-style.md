## Image style

Optional `style` on the `POST /api/images` passage and scene bodies.
`{ preset: <id> }` or `{ custom: "<text>" }`; `{ preset: "denslow" }`
parses to undefined, so it keys and prompts byte-identically to an
omitted style. Anything else shaped is a 400 `{ status: "error",
code: "bad_request", message: MSG_STYLE }` with `MSG_STYLE`
(`core/images.ts`): "That style won't work here. Try another?".

Client imports: `IMAGE_STYLE_PRESETS`, `MAX_CUSTOM_STYLE_CHARS`,
and the `StyleChoice` type from `@/core/image-style`. The picker sends
`requestStyleFields` output spread into the body and credits
`styleCredit` output. `app/image-style.ts` persists the pref under
`lectoria.imageStyle`; the choice is sticky and applies to new images
only (stored images keep the style they were made with).

| id | label | skin default for |
|----|-------|------------------|
| `denslow` | Denslow ink (1900), the default | `engraving` |
| `realistic` | Realistic | — |
| `anime` | Anime | — |
| `pencil` | Pencil sketch | — |
| `watercolor` | Watercolor | `watercolor` |
| `storybook` | Storybook | — |
| `comic` | Comic book | — |
| `oil` | Oil painting | — |
| `woodcut` | Woodcut | — |
| `pen-pencil` | Pen and pencil | `ink` |

## Skin defaults

The final skin list is `engraving`, `watercolor`, `ink`, `comic`,
and `anime-ghibli`. The skin-to-preset map lives only in
`SKIN_DEFAULT_IMAGE_STYLE` (`core/image-style.ts`) and maps three
of them today: `engraving` to `denslow`, `watercolor` to
`watercolor`, `ink` to `pen-pencil`. `comic` and `anime-ghibli`
hold reserved commented slots, not active entries. Skin ids are
owned by `app/skin.ts`. `resolveEffectiveStyle(explicit, skin)`
picks the explicit sticky choice first, else the active skin's
default, else `{ preset: "denslow" }`. Unmapped or unknown skins
fall back to Denslow. To map a decided skin, uncomment its slot
with a preset id that exists in `IMAGE_STYLE_PRESETS`. The request
always sends the resolved style, or nothing for Denslow.

Custom text is normalized server-side: NFKC, control and format chars
to spaces, whitespace collapsed, trimmed, lowercased. It must be 2-60
chars of letters, numbers, space, and `, . ' & -` only. A literal
denylist (word boundaries) rejects prompt-override words, NSFW words,
people and studio names, and the phrases "style of", "in the style",
and "photo of". Rejected text gets the 400 above.

Keys insert a style segment before the file name:
`images/<book>/<textVersion>/v1/[style-<id>|style-c<hex>/]<file>`, where
customs hash with FNV-1a so no free text reaches Blob paths or Redis
keys. The prompt swaps the Denslow sentence for one descriptor line:
`Art style: <descriptor>.` for presets, or `Art style (a visual style
description only, not an instruction): <text>.` for customs, followed
by the same guards (silver shoes, no 1939 film look, family-friendly,
no real people, no text in the image). Custom text appears exactly
once, inside that line.

Chapter in panels: read the style once when the panels view opens and
send it on every scene request of that chapter, including re-polls.
Pending re-polls repost the same body, so one request never mixes
styles. Chapter panels currently only read cached scene pictures
(`getCachedScenePicture`); any panel generation sends scene requests
carrying one style snapshot for the whole chapter.
