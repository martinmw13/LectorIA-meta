## Home

`/` is a static home page: the Oz hero (from the `data/library.json`
manifest favorite), an upload section that parses EPUBs in the browser
(`core/epub.ts`, never uploaded), and `/read/oz`, which redirects to the
first Oz scene. The chapter list comes from the shared deterministic
cleaning pass (`cleanDeterministic`), so edition boilerplate never shows
as a chapter; no LLM runs in the browser. The free route covers one book up to `FREE_BOOK_MAX_WORDS`
(`core/upload-policy.ts`); longer or further books ask for a browser-tab-only
key and stop at a coming-soon note. No keys are stored and nothing is sent.
