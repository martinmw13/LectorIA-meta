# 77: reader chat

Build the reader chat in `docs/design/chat.md` (from #90) with Martin's
five decisions: the key step after the 15 daily questions and after the
global cap, the whole book as context with spoilers on, per-tab
sessionStorage per book, the "Ask the book" label in one constant, and
three verified spoiler-safe questions per chapter in
`data/books/oz/chat-suggestions.json`.

Contract first: `core/chat.ts` holds the request, error codes, fixed
copy, limits (15 a day, 500 characters, 6 messages, 400 output tokens),
and the model id `muse-spark-1.3`.

Round A, server: `app/api/chat/route.ts` and `server/chat/`. Body limit,
parse, hashed-IP plus anonymous-cookie quota, Turnstile when its secret
is set, shared spend reserves with the image cap, then a streamed Meta
call with 20 s to first byte, 60 s total, and abort on disconnect.
Errors reach the client as fixed copy only; logs carry no question,
answer, key or IP.

Round B, client: `app/chat/`. Launcher and panel above the music player,
streaming answers, the spoiler switch with a confirm, suggested
questions, Turnstile, and the home page's "Bring your own key!" step
in Meta-only mode with the key in memory only.

Skipped: phones under 1024 px (the launcher is hidden there), BYOK
with OpenAI-compatible base URLs.
