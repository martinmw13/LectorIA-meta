Apply the findings in `docs/reviews/02.md` to the uncommitted changes. Do not commit. Do not touch `.agents/skills/`, `agent-logs/`, or `docs/reviews/02.md`. No app code.

Verified values to use (looked up by the manager, do not change them):
- gitleaks_8.28.0_linux_x64.tar.gz sha256: a65b5253807a68ac0cafa4414031fd740aeb55f54fb7e55f386acb52e6a840eb
- actions/checkout v4.4.0 commit: 11d5960a326750d5838078e36cf38b85af677262
- actions/setup-node v4.4.0 commit: 49933ea5288caeca8642d1e84afbd3f7d6820020

1. ci.yml: drop the checksums file download; `curl -sSfLO` the tarball and check it with `echo '<sha256>  gitleaks_8.28.0_linux_x64.tar.gz' | sha256sum -c -`.
2. ci.yml: pin both actions to the SHAs above with `# v4.4.0` comments. Update `.github/dependabot.yml` to also watch `github-actions` weekly if it does not already.
3. curl uses `-sSfL`.
4. check-secrets.mjs history mode: flag forbidden filenames seen in `+++ b/` headers once per path, with a unit test.
5. SECURITY.md: say "hardcoded sha256" and that actions are pinned to commit SHAs.
6. SECURITY.md and .env.example: make the key split clear. The owner's `META_API_KEY` funds the public chat and images within the per-person quota and the global cap. Once a person's quota is used, they may bring their own key (BYOK). A BYOK request uses only the user's key and never falls back to the owner key. Remove the sentence "A request without a user key is rejected, never billed to the owner."
7. Add one row's worth of credit in `BUILT_DURING_HACKATHON.md` task 2: "Muse Code (muse-spark-1.3-contributor), reviewed by Muse Spark 1.3 Standard".

Verify: `npm run test:hooks`, `node scripts/check-secrets.mjs --all`, and `~/.local/bin/gitleaks dir . --redact --no-banner`. End with a short summary. Sentence case, no em dashes.
