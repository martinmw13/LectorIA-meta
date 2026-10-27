# Security

## Report a vulnerability

Use GitHub private vulnerability reporting on this repo. Do not open a public issue for a security bug.

## What is in place now

- Secrets live only in env vars. `.env.example` holds names, never values.
- A pre-commit scan blocks staged secrets: gitleaks when installed, plus the built-in scanner in `scripts/check-secrets.mjs`, which always runs.
- `.gitleaks.toml` extends the default gitleaks config and allowlists only the known test placeholder strings, never paths.
- GitHub secret scanning and push protection guard the remote.
- Dependabot alerts track vulnerable dependencies.

## Rules for later tasks

Planned, not built yet. Each app task implements its share.

- The BYOK Meta key is never stored server-side or in logs. It stays in the browser session (`sessionStorage`) and travels over HTTPS per request in a header.
- The anonymous session cookie is signed with HMAC (`SESSION_SECRET`) and set httpOnly, Secure, SameSite=Lax.
- IPs are stored only as salted hashes (`IP_HASH_SALT`) with daily keys.
- Quotas are strict per person: 15 questions and 5 images per day, counted by hashed IP and anonymous cookie, whichever runs out first. A global spend cap in Redis sits above them.
- Turnstile runs once per session.
- Errors never return stack traces or raw exception text.
- Book source files (epub, raw text) are never publicly served. Only processed public-domain JSON leaves the server.
- Security headers and a CSP live in `next.config.ts`.
- Input limits hold: question 500 chars, passage 600 chars. The server verifies each passage against the book text.
