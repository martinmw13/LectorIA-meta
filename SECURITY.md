# Security

## Report a vulnerability

Use GitHub private vulnerability reporting on this repo. Do not open a public issue for a security bug.

## What is in place now

- Secrets live only in env vars. `.env.example` holds names, never values.
- A pre-commit scan blocks staged secrets: gitleaks when installed, plus the built-in scanner in `scripts/check-secrets.mjs`, which always runs.
- Scans cover all tracked paths except lockfiles, including `agent-logs/`, `public/`, and `.agents/skills/`. CI runs the built-in scanner with `--all` plus pinned gitleaks v8.28.0 with a hardcoded sha256, and GitHub Actions pinned to commit SHAs.
- `.gitleaks.toml` extends the default gitleaks config and allowlists only the known test placeholder strings, never paths.
- GitHub secret scanning and push protection guard the remote.
- Dependabot alerts track vulnerable dependencies.

## Rules for later tasks

Planned, not built yet. Each app task implements its share.

- The BYOK Meta key is never stored server-side or in logs. It stays in the browser session (`sessionStorage`) and travels over HTTPS per request in a header.
- The owner `META_API_KEY` funds the public chat and images within the per-person quota and the global cap. Once a person's quota is used, they may bring their own key (BYOK). A BYOK request uses only the user's key and never falls back to the owner key.
- BYOK requests are still rate-limited per IP.
- Logged error objects hold no keys, tokens, or raw provider output.
- HMAC comparisons run in constant time.
- The CSP allows `challenges.cloudflare.com` for scripts and frames, and `*.public.blob.vercel-storage.com` for images.
- Modal endpoints require proxy auth. Proxy tokens live only in env and travel as Modal-Key / Modal-Secret headers.
- Spend is counted in integer micro-dollars: reserve with Redis `INCRBY` before each model call, refund with `DECRBY` after.
- The anonymous session cookie is signed with HMAC (`SESSION_SECRET`) and set httpOnly, Secure, SameSite=Lax.
- IPs are stored only as salted hashes (`IP_HASH_SALT`) with daily keys.
- Quotas are strict per person: 15 questions and 5 images per day, counted by hashed IP and anonymous cookie, whichever runs out first. A global spend cap in Redis sits above them.
- Turnstile runs once per session.
- Errors never return stack traces or raw exception text.
- Book source files (epub, raw text) are never publicly served. Only processed public-domain JSON leaves the server.
- Security headers and a CSP live in `next.config.ts`.
- Input limits hold: question 500 chars, passage 600 chars. The server verifies each passage against the book text.
