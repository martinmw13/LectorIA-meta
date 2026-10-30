## Home

`/` is a static home page: the Oz hero (from the `data/library.json`
manifest favorite), an upload section that parses EPUBs in the browser
(`core/epub.ts`, never uploaded), and `/read/oz`, which redirects to the
first Oz scene. The chapter list comes from the shared deterministic
cleaning pass (`cleanDeterministic`), so edition boilerplate never shows
as a chapter; no LLM runs in the browser. Choosing "Read with soundtrack"
POSTs the sections to `/api/uploads` and steps the job to done, then opens
`/read/<id>`. The free route covers two books a day up to `FREE_BOOK_MAX_WORDS`
(`core/upload-policy.ts`); longer or further books ask for a browser-tab-only
key, sent per call in a header and never stored. Finished uploads are listed
under "Your books".
