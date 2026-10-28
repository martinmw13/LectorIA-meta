# Task 20: home

Goal: a home page at `/` with the Oz hero, an upload section for your own
books, and a link to the reader at `/read/oz`.

Routes: `/` is a static server page (title "Lectoria"). `app/read/oz`
redirects to the first Oz scene, reusing the old home logic
(`buildReaderModel` + `loadOzBook`). `/leer/<sceneId>` links keep working.

Parser limits (`core/epub.ts`, client-safe): EPUB only, 20 MB file cap,
8 MB per-entry cap, 60 MB total inflate cap. No word limit: long books
parse fine and the UI routes them to BYOK. Errors stay warm and generic.

Upload flow (`app/home/`, `core/upload-policy.ts`): the free quota is one
book up to `FREE_BOOK_MAX_WORDS` (about 200 pages), tracked in the browser
only (`lectoria.freeBookUsed.v1`; UI hint, enforced server-side later).
Anything longer, or any book after the free one, asks for your own key
(Meta, or OpenAI-compatible with base URL and model). The key lives in
React state, never stored or logged. Both paths end at a processing note:
soundtracks for your own books are coming soon, and Oz shows how it works.

Deferred: processing uploaded books (server pipeline, key handling, cost
guards). The BYOK step collects a key but sends nothing anywhere.
