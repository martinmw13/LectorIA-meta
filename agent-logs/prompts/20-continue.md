Continue task 20 on branch `home` (this worktree). Your previous session was
cut off after writing core/epub.ts, core/library.ts, their tests,
data/library.json and the fflate/jsdom deps (all staged, nothing committed,
no UI yet). The original brief is agent-logs/prompts/20-impl.md: read it
and follow it, EXCEPT for the scope changes below, which win. Same rules:
no `next start`/`next dev`, no secrets, no .env, no `build:book`, do not
edit app/globals.css, app/tokens.css, app/layout.tsx, app/leer/*,
app/reader.tsx. Attached screenshots are the look to match.

Scope changes from the product owner:

A. Library: for now ONLY Oz. data/library.json lists only the Oz entry
   (keep the manifest + loader so books can be added later without UI
   changes). Remove the "soon" status and every "Coming soon" placeholder
   card; status is just "ready" (keep the field). The hero is rendered
   from the manifest favorite (title, author, year, reading time via
   readingMinutes) with a small "★ Our favorite" badge and the
   cyclone-house image; button "Start reading" -> `/read/oz`. Under the
   hero, a grid of the other ready entries, rendered only when there are
   any (none today). Copy near the hero/library, short and warm, making
   clear library books are ready instantly: e.g. "Ready to read right now,
   music and all. No waiting."

B. Sources: "Want more? Find free classics at Project Gutenberg ↗ and
   Standard Ebooks ↗, then bring them here." (links as briefed).

C. Upload: there is NO hard word limit any more. Remove EpubError
   "too_long", its message and MAX_EPUB_WORDS from core/epub.ts and tests.
   Still count words for every parsed book (EpubBook.words; keep the
   60 MB total inflate cap and the 8 MB per-entry cap); show
   "About N pages" (250 words/page) on the parsed book card.
   New config module core/upload-policy.ts (pure, client-safe):
   `export const FREE_BOOK_MAX_WORDS = 50_000; // provisional, may change once we know the processing cost`
   `export const WORDS_PER_PAGE = 250;`
   `export function approxPages(words: number): number`
   `export type UploadRoute = { kind: "free" } | { kind: "byok"; reason: "too_long" | "free_used" };`
   `export function uploadRoute(words: number, freeBookUsed: boolean): UploadRoute`
   (too_long wins when both apply). Small tests.
   Copy next to the drop zone: "Your first book is on us, up to about 200
   pages. Longer books or more of them? Bring your own key." (derive "200"
   from the constants) and "EPUB only, up to 20 MB. Nothing leaves your
   computer until you choose to read it."
   After a successful parse, show the book card, then branch:
   - free: button "Read with soundtrack". Clicking it marks the free book
     used and goes to the processing state.
   - byok: a short friendly reason first. too_long: "This one is longer
     than about 200 pages, so it needs your own key." free_used: "You've
     already used your free book, so this one needs your own key." Then
     the BYOK step.
   Free-book flag: localStorage key `lectoria.freeBookUsed.v1` = "1",
   read/written via a tiny helper in app/home/ with try/catch (never
   throws). Comment: UI hint only; real enforcement will be server-side.
   BYOK step (UI only, no network call): heading "Bring your own key to
   read this book with its soundtrack". Provider choice as a radio group:
   "Meta" (selected by default, labelled Recommended) and
   "OpenAI-compatible", which reveals "Base URL" (must be https://, inline
   friendly error otherwise) and "Model" fields. A masked key field
   (type=password, autoComplete="off", spellCheck false, no name that
   password managers latch onto; aria-describedby the privacy copy).
   Privacy copy: "Your key stays in this browser tab. It's never stored on
   our servers, and it's only used to process this book." Button "Read
   with soundtrack" enabled once the needed fields are filled. The key
   lives only in React state: never localStorage/sessionStorage/cookies,
   never logged, never in a URL or console; clear it from state when
   the user submits, picks another book, or the component unmounts.
   Processing state (both branches): "Soundtracks for your own books are
   coming soon. For now, Oz shows how it works." with a link to `/read/oz`
   and "Choose another book".
   Keep every file under the 5k-token hook; split app/home/ components
   (e.g. hero.tsx, upload.tsx, book-card.tsx, byok.tsx, home.css).
   Update docs/tasks/20-home.md and docs/contracts.md for this flow.

Then run the full verification list from the brief, commit in small logical
commits, do not push, and end with a short summary.
