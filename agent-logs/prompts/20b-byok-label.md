# Task 20b: home BYOK label reads "Bring your own key!"

Branch `byok-label`, repo LectorIA-meta. Read AGENTS.md first and follow it (no secrets, never --no-verify, never run `next dev`/`next start`). Tiny copy change only.

Owner rule (Martin): on the home, the bring-your-own-key label must read exactly `Bring your own key!` (capital B, exclamation mark).

Change exactly two strings, nothing else:
1. `app/home/upload.tsx`: the fine print sentence ending `Bring your own key.` becomes `Bring your own key!`.
2. `app/home/byok.tsx`: the `<h3 className="home-section-title">` heading `Bring your own key to read this book with its soundtrack` becomes `Bring your own key!`.

Update any test that asserts the old strings (grep first). Add a one-row entry to the table at the end of BUILT_DURING_HACKATHON.md: `| 2026-10-28 | 20b: byok label | Home BYOK label reads "Bring your own key!" | Muse Code (Contributor) |`.

Run `npx vitest run` and `npx tsc --noEmit`, then commit with message `Home: label reads "Bring your own key!"` (the hook adds the trailer). Report in 2-3 lines.
