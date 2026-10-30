# Task 87: distinct image styles (prompt port)

You are working in this repo (Next.js + TypeScript, vitest). Owner approved six new image style prompts after a live test. Port them into the app. Keep the change small, pure, and well tested. Do not touch any network, env, Blob, Redis, or run scripts/pregen-chapters.ts for real. Tests must mock Meta/Blob/Redis like the existing ones. Do not run `git commit` or `git push`; leave changes in the working tree.

## Inputs
- `style-presets.tmp.json` at the repo root holds the exact approved text: for each of `denslow, watercolor, pen-pencil, comic, graphite, lantern-dusk` an object `{lead, composition, page, reminder, monochrome}`. Copy these strings VERBATIM into code, then DELETE `style-presets.tmp.json`.
- Current prompt code: `core/images.ts` (`styleLine`, `buildPrompt`), `core/panels.ts` (`buildChapterPrompt`), `core/image-style.ts` (presets, `styleDescriptorLine`, DENY list), `server/images/final-prompt.ts` (`buildFinalPrompt`, `buildPregenChapterPrompt`, shared by route and pregen), `core/types.ts` (`PROMPT_VERSION`, `CHAPTER_PROMPT_VERSION`).

## Design
1. New pure module `core/style-prompts.ts` (no node imports):
   - `export interface StylePrompt { lead: string; composition: string; page: string; reminder: string; monochrome: boolean }`
   - `export const STYLE_PROMPTS` typed as a readonly record over exactly those 6 preset ids (ids must be `ImageStylePresetId`s), strings verbatim from the JSON.
   - `stripColorWords(text)`: removes color words for monochrome styles. Port this logic exactly:
     ```ts
     const HUE = "red|pink|rosy|blue|bluish|green|greenish|yellow|orange|purple|violet|brown|golden|gold|crimson|scarlet|teal|turquoise|navy|tan|auburn|ginger|emerald";
     text.replace(new RegExp(`\\b(?:${HUE})(?:-and-(?:white|black|${HUE}))?(?:-(?:checked|striped))?\\s*`, "gi"), "")
         .replace(/\bcolou?rful\s*/gi, "").replace(/\s+,/g, ",").replace(/\s{2,}/g, " ")
     ```
   - `sentence(t)`: trims and appends "." unless it already ends in `.`, `!` or `?` (also treat a trailing `."`/`!"`/`?"`/`.'` as ended). Used everywhere a clipped description is followed by a period, which fixes the current `..` double period.
   - `stylePromptFor(style: ImageStyle | undefined, book?: StyleBook): StylePrompt | undefined`: style undefined (the default, which is also what `{preset:"denslow"}` parses to) returns `STYLE_PROMPTS.denslow` only when `book` is undefined or `book.id === "oz"`, else undefined (non-Oz default keeps the existing generic "Classic book illustration for <title> by <author>" line). A preset with an entry returns it for any book. Anything else (other presets like realistic/anime/oil, custom text) returns undefined and keeps the existing legacy descriptor-line path.
   - `guardLine(book?: StyleBook)`: Oz or undefined book: `Characters follow the 1900 book: Dorothy wears silver shoes. Nothing from the 1939 MGM film, no ruby slippers, no film look. ` ; other books: `Faithful to the text and period of <title> by <author>, not any film or TV adaptation. ` (clean title/author of control chars like `cleanBookField` does). Then always: `Family-friendly, no real people, no purple. No text of any kind anywhere in the image: no letters, digits, captions, sound effects, speech balloons, page or panel numbers, signatures, logos or corner marks.`
2. Structured prompts, used whenever `stylePromptFor` returns a prompt. `reference` is the bookmap block (may be empty); when the preset is `monochrome`, pass it through `stripColorWords`. Single spaces between parts, no empty parts, no double spaces, no `..`.
   - Chapter page (`buildChapterPrompt` in core/panels.ts, gains optional `reference?: string`):
     `STYLE: <lead> <composition> CONTENT: Chapter "<title>" as one square comic page with <N> panel(s) in <R> row(s) (row 1 has a, ...), read left to right, top to bottom. <page> Panel 1: <sentence(clip(desc,PANEL_DESC_CHARS))> Panel 2: ... <reference> STYLE REMINDER: the whole page, every panel, is drawn in this one style. <reminder> <guardLine>`
   - Scene / passage (`buildPrompt` in core/images.ts, gains optional `reference?: string`):
     scene: `STYLE: <lead> <composition> CONTENT: Scene "<title>". <sentence(clip)> <reference> STYLE REMINDER: the whole image is drawn in this one style. <reminder> <guardLine>`
     passage: `STYLE: <lead> <composition> CONTENT: Scene "<title>". Passage: <sentence(passage)> Context: <sentence(clip)> <reference> STYLE REMINDER: ...same...`
     (no `page` part for scenes).
   - Legacy path (no StylePrompt): keep today's text, with the reference still appended at the end as today, only fixing `..` via `sentence()`.
   - `buildFinalPrompt` passes `reference` into the builders instead of appending it itself (the builders decide placement). `buildPregenChapterPrompt` must stay byte-identical to the route (parity tests).
3. Named references are now allowed in OUR preset text (Marvel, Studio Ghibli's Spirited Away, W. W. Denslow, Beatrix Potter, Arthur Rackham). USER custom style text must still be rejected for those words: keep DENY_WORDS/DENY_PHRASES exactly as they are; only update their comment to say the server-owned preset prompts may name references and user custom text may not.
4. Bump `PROMPT_VERSION` to `"v5"` and `CHAPTER_PROMPT_VERSION` to `"c5"`, with a one-line comment that v5/c5 are the distinct style prompts. Update `docs/contracts/image-api.md` (v4/c4 mentions) accordingly.
5. Tests (update existing ones that assert old text/keys; keep their intent):
   - New `core/style-prompts.test.ts`:
     - A "prompt text is tied to the key version" test: build a canonical string from `JSON.stringify(STYLE_PROMPTS)` plus, for a fixed small fixture (2 panels, fixed title, fixed reference with color words, Oz book and a non-Oz book), the chapter prompt, scene prompt and passage prompt for every preset in STYLE_PROMPTS plus the default (style undefined) and one legacy preset ("oil") and one custom. Hash it with node:crypto sha256. Assert `{ promptVersion: PROMPT_VERSION, chapterPromptVersion: CHAPTER_PROMPT_VERSION, sha256: <literal> }` equals a literal object, with a comment: "If this fails you changed prompt text: bump PROMPT_VERSION (scene/passage) and/or CHAPTER_PROMPT_VERSION (chapter pages), then update the hash." Compute the literal by running the test once.
     - Oz default chapter prompt starts with `STYLE: In the style of W. W. Denslow`, contains `silver shoes`, `no purple`, and the reference appears before `STYLE REMINDER:`.
     - graphite strips color words from the reference (e.g. "a blue-and-white checked gingham dress, a pink sunbonnet" loses blue/pink) but other presets keep them.
     - non-Oz book with comic: no `Dorothy`, no `MGM`, contains `Faithful to the text and period of`.
     - non-Oz default (style undefined) keeps the legacy generic line, not Denslow.
     - no prompt contains `..` or double spaces, even when descriptions end with a period.
     - lantern-dusk contains `gray in the story does not mean a gray palette`; comic contains `still printed in bold saturated comic colors`.
     - custom style text containing "marvel", "ghibli", "studio", "in the style" is still rejected by `parseStyleChoice`.
   - Update parity tests in `server/images/pregen-prompt.test.ts` (should still pass, now with the new text) and key expectations (v5, c5) in `core/images-chapter.test.ts`, `core/image-ranges.test.ts`, and any other test.
6. Run `npm run typecheck`, `npx vitest run`, `npm run lint` (only ensure you add no new lint errors in touched files), `npm run check:size`. All tests must pass. Keep every file under the size limit.

Write short, plain comments. When done, print a summary of the files changed.
