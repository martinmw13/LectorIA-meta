Task 20 on branch `home` (this worktree). Do not run `next start` or
`next dev`. Do not read or print secret values; never create .env files.
Never run `npm run build:book` (paid APIs). Read AGENTS.md first and follow
it (ponytail: smallest complete change). All UI copy in English, warm and
human, never the word "Generated", no AI-slop phrasing (no "seamless",
"unlock", "magic", "journey", "immerse", emoji in copy).

Goal: a home page. Today `/` (app/page.tsx) redirects straight into the Oz
reader. It must become a home. UI + client-side EPUB parsing only: no new
API routes, nothing uploaded, no paid calls.

Another branch (`folio-reader`, read it with `git show folio-reader:<path>`
or `git diff main...folio-reader`) is redesigning the reader and edits
app/globals.css, app/tokens.css, app/layout.tsx, app/leer/*, app/reader.tsx.
To avoid conflicts: DO NOT edit any of those files except app/page.tsx.
Put everything new under app/home/ (components + one CSS file imported by
the home page) and core/epub.ts. Use only the existing CSS variables from
app/tokens.css (--color-accent, --color-accent-hover, --color-on-accent,
--color-text, --color-text-muted, --color-surface, --color-surface-soft,
--color-border, --font-ui, --font-book, sizes, spaces, --motion-duration).
They already flip for dark mode (on main via prefers-color-scheme; on the
folio branch via html[data-theme]); never hardcode colors other than an
rgba shadow. Note the folio branch sets `body { overflow: hidden }`, so the
home root must be its own scroll container (min-height/height 100dvh,
overflow-y auto).

1. Routing
   - app/page.tsx: the home (server component, static). Metadata title
     "Lectoria".
   - New app/read/oz/page.tsx: server redirect to the first Oz scene, the
     exact logic app/page.tsx has today (buildReaderModel + loadOzBook,
     `/leer/<firstSceneId>`). Existing `/leer/<sceneId>` deep links keep
     working untouched (they are the reader routes; do not move them).
   - The home's primary button is a plain link to `/read/oz`.

2. Look (match the attached Folio "margin" screenshots, light and dark):
   desktop only, generous outer margins, nothing edge to edge. Top: the
   letter-spaced "LECTORIA" wordmark on the left with a 1px hairline rule
   under it inside the margins (same as the screenshots). Meta blue accent
   only, never purple. Serif (--font-book) for book titles and the headline,
   --font-ui for the rest. Minimal, elegant, calm. Rounded 10-12px image
   corners like the folio image pane. Visible focus rings
   (outline with --color-accent). Respect prefers-reduced-motion (use
   --motion-duration).
   Layout: a two-column hero. Left: the image public/art/panels/
   cyclone-house.jpg (already in this worktree; use next/image or <img>
   with width/height and meaningful alt). Right: small eyebrow
   "Start here", serif headline "The Wonderful Wizard of Oz", line
   "L. Frank Baum · 1900", one or two sentences, e.g. "Every scene has its
   own music, picked to match what's happening on the page. Oz is ready to
   read right now." Primary button (filled accent) "Start reading".
   Below the hero, a "Library" section (see 2b), then a section headed
   "Bring your own book":
   - Drop zone (dashed hairline border, --color-surface-soft on drag-over)
     "Drop an EPUB here, or choose a file" where "choose a file" opens a
     visually hidden <input type="file" accept=".epub,application/epub+zip">.
     The zone is a keyboard-focusable control (Enter/Space opens the
     picker) with an aria-label; status/error text in an aria-live region.
     Small print: "EPUB only, up to about 200 pages (50,000 words). Your
     book stays on your computer."
   - Sources line with external links (target=_blank rel="noopener
     noreferrer", a small ↗ after each): "Looking for a book? Find thousands
     of free classics at Project Gutenberg ↗ and Standard Ebooks ↗."
     URLs https://www.gutenberg.org/ and https://standardebooks.org/.
   States of the upload area: idle, dragging, reading ("Opening your
   book…"), parsed, error. Parsed: a book card (cover if any, else a quiet
   serif monogram tile; title in serif, author, "N chapters", the first
   3 chapter titles muted), then a "Coming soon" note: "Soundtracks for your
   own books are coming soon. For now, Oz shows how it works." plus a text
   button "Choose another book" that returns to idle. Error: the friendly
   message plus "Try another file". Revoke any object URL on reset/unmount.

2b. Library (preloaded classics), driven by a manifest so books can be added
   without UI changes:
   - New data/library.json: array of { id, title, author, year, words,
     gutenbergId, status: "ready" | "soon", favorite?: true }. Entries
     (placeholder list; the final list comes later, so nothing else may be
     hardcoded in the UI): oz "The Wonderful Wizard of Oz" L. Frank Baum
     1900 words 39300 gutenberg 55 ready favorite; alice "Alice's
     Adventures in Wonderland" Lewis Carroll 1865 26400 g11; carol "A
     Christmas Carol" Charles Dickens 1843 28900 g46; jekyll "Strange Case
     of Dr Jekyll and Mr Hyde" Robert Louis Stevenson 1886 25500 g43;
     timemachine "The Time Machine" H. G. Wells 1895 32100 g35;
     metamorphosis "The Metamorphosis" Franz Kafka 1915 22000 g5200;
     peterpan "Peter Pan" J. M. Barrie 1911 47000 g16; callwild "The Call
     of the Wild" Jack London 1903 31800 g215; darkness "Heart of Darkness"
     Joseph Conrad 1899 38900 g219; gatsby "The Great Gatsby" F. Scott
     Fitzgerald 1925 47100 g64317. All but oz status "soon".
   - Small typed loader core/library.ts: validates the JSON shape at import
     (throws on a bad entry; test it), exports the list with "ready"
     favorites first, and `readingMinutes(words)` at 250 words/min shown as
     "About 2 h 40 min" / "About 45 min" (test it).
   - Grid of cards (5 columns at desktop width): cover, serif title, author,
     reading time. Covers: Oz uses public/art/panels/cyclone-house.jpg
     cropped; the others get a typographic cover drawn in CSS (title in
     serif and author on a quiet tinted tile using only the tokens; vary
     the tint per book with a small deterministic set of accent/neutral
     mixes via color-mix, never purple). No external images.
   - Oz first, highlighted: a small "★ Our favorite" badge and accent
     border; whole card links to /read/oz. "soon" cards are not links: a
     muted "Coming soon" label, aria-disabled, and on hover/focus a short
     note "We're still composing this one's soundtrack." Keep it calm.
   - The hero can stay as the big Oz recommendation; the library grid sits
     below it. Keep the page from feeling long: the hero is compact.

3. core/epub.ts, client-safe pure parser (no node imports):
   - Add dependency `fflate` (pin exact version 0.8.3 in package.json and
     update package-lock with `npm install fflate@0.8.3 --save-exact`).
     Parse XML with the platform DOMParser ("application/xml"); for tests
     add devDependency `jsdom` (exact, `npm install -D jsdom@30.1.3
     --save-exact` plus `@types/jsdom` only if needed) and use
     `// @vitest-environment jsdom` in the test file only.
   - `export const MAX_EPUB_BYTES = 20 * 1024 * 1024`.
   - `export type EpubBook = { title: string; author: string | null;
     chapters: string[]; cover: { bytes: Uint8Array; mediaType: string } | null }`.
   - `export class EpubError extends Error` with a `code`:
     "not_epub" | "too_large" | "drm" | "unreadable"; and a map
     `EPUB_ERROR_MESSAGES` with the warm copy (codes also include
     "too_long"):
       not_epub: "That doesn't look like an EPUB. Try a file that ends in .epub."
       too_large: "That file is bigger than 20 MB. Most novels are far smaller, so try another edition."
       drm: "This book is copy-protected, so we can't open it. Free classics from Project Gutenberg or Standard Ebooks work well."
       unreadable: "We couldn't read this EPUB. It might be damaged. Try another copy."
       too_long: "This book is longer than about 200 pages (50,000 words), our limit for now. Pick a shorter one, or try a book from our Library above. Project Gutenberg and Standard Ebooks have plenty of short classics."
   - `export function parseEpub(bytes: Uint8Array): EpubBook` (sync is
     fine) and a thin `readEpubFile(file: File): Promise<EpubBook>` that
     checks `file.size > MAX_EPUB_BYTES` BEFORE reading (too_large), then
     arrayBuffer -> parseEpub. parseEpub also rejects > MAX_EPUB_BYTES.
   - Checks, in order: zip magic "PK\x03\x04" else not_epub; unzip with
     fflate `unzipSync` using the `filter` option so ONLY needed entries are
     inflated (mimetype, META-INF/container.xml, META-INF/encryption.xml,
     META-INF/rights.xml, the OPF, the nav/NCX, the cover image) and reject
     (unreadable) any wanted entry whose originalSize > 8 MB (zip-bomb guard;
     do this in the filter so nothing big is inflated). Missing mimetype or
     content not "application/epub+zip" -> not_epub. rights.xml present ->
     drm. encryption.xml with any EncryptionMethod Algorithm other than the
     font obfuscation ones (http://www.idpf.org/2008/embedding and
     http://ns.adobe.com/pdf/enc#RC) -> drm. container.xml -> rootfile
     full-path; resolve hrefs relative to the OPF directory (handle "../",
     URL-decode, strip "#fragment"). Title: first dc:title (trim, collapse
     whitespace; fallback "Untitled"). Author: first dc:creator or null.
     Chapters: EPUB 3 nav (manifest item with properties containing "nav",
     the <nav epub:type="toc"> top-level <ol> > <li> labels) else EPUB 2 NCX
     (spine toc attr or media-type application/x-dtbncx+xml, top-level
     navPoint navLabel/text). Drop empty labels. Cap at 500.
     Word count: `export const MAX_EPUB_WORDS = 50_000`. Also inflate the
     spine XHTML documents (linear ones; still under the per-entry 8 MB cap,
     plus a total inflated cap of 60 MB -> unreadable), take
     body textContent from DOMParser ("application/xhtml+xml", falling back
     to "text/html" on parse error), count words as runs of
     /[\p{L}\p{N}]+(?:['’][\p{L}]+)*/gu, stop early once over the max.
     Over the max -> EpubError too_long. EpubBook gains `words: number`;
     show it on the card as "About N pages" (250 words per page).
     Cover: manifest item with properties containing "cover-image", else
     <meta name="cover" content=id>; only image/jpeg|png|gif|webp
     media types; else null. Any XML/parse failure -> unreadable. Never
     use innerHTML anywhere; all text renders through React.
   - Namespaces: use getElementsByTagNameNS where needed (dc, opf, ncx,
     xhtml, epub) or localName matching; must work for both jsdom and
     browsers.

4. Tests (core/epub.test.ts). Build fixtures in the test with fflate
   `zipSync` (no binary fixture; *.epub is gitignored): a tiny
   public-domain EPUB 3 (title "The Wonderful Wizard of Oz", creator
   "L. Frank Baum", nav with "Chapter I. The Cyclone", "Chapter II. The
   Council with the Munchkins", "Chapter III. How Dorothy Saved the
   Scarecrow", a 1x1 PNG cover via properties="cover-image", OPF in OEBPS/)
   and a tiny EPUB 2 with NCX and <meta name="cover">. Cover: parses
   title/author/chapters/cover for both; not_epub for random bytes, for a
   zip without mimetype, for a wrong mimetype; drm for rights.xml and for
   encryption.xml with an AES algorithm; font obfuscation alone parses
   fine; too_large via readEpubFile with a fake File-like object whose size
   is 20 MB + 1 (assert arrayBuffer is never called); words counted for
   the fixture; too_long for a fixture with 50,001 words in one chapter; unreadable for a
   broken OPF and for an entry whose declared size is over the cap (you can
   test the cap helper directly if forging sizes is awkward). Keep tests
   small and behavioural.

5. Docs: short docs/tasks/20-home.md (goal, routes, parser limits,
   what's deferred: processing uploaded books). docs/contracts.md: one
   short paragraph for the home and `/read/oz`. One line in
   BUILT_DURING_HACKATHON.md. Append to public/art/SOURCES.md exactly this
   line (identical to the folio branch so the merge is clean):
   - panels/cyclone-doorway.jpg, panels/cyclone-house.jpg: images made by Meta's image model during the Lectoria image spike (Denslow-style prompts), recompressed to JPEG. Placeholder panel art for chapter 1 until panels are drawn.

6. Verify: `npx next typegen`, `npm run typecheck`, `npm test`,
   `npm run test:hooks`, `npm run build`, `npm run check:isolation`,
   `node scripts/check-secrets.mjs --all`, `npm run check:size`. Keep every
   file under the 5k-token size hook (split components). Commit in small
   logical commits (the hooks add the trailer). Do not push. End with a
   short summary of files and checks.
