# Review: Muse attribution (README section, docs/MUSE.md, Muse Code label)

Author and reviewer: Grok Bot. Docs and CI only, no app code, so no Muse
implement or review rounds. Commits carry `Rescue: Grok Bot`.

## Scope

- README: badge and a "Built with Meta Muse" section.
- `scripts/muse-stats.mjs` writes `docs/MUSE.md` from git history and the
  GitHub API; `npm run muse:stats` runs it, and the `muse-stats` workflow
  commits the refresh after each push to main.
- `muse-label` workflow adds the `Muse Code` label to PRs with Muse commits.

## Claim check

Each README claim was checked against the code before writing it:

- Cleaning: `pipeline/clean-providers.ts` defaults the Modal model to
  `meta-models/Muse-Spark-Open-816B-A42B`, Meta API fallback; `build.ts`
  uses the judge only for EPUB books.
- Scenes: `pipeline/segment.ts`, one `completeJson` call per chapter.
- Override: `core/emotion.ts` `needsOverride` (`unknown` or confidence
  under `LOW_CONFIDENCE` 0.6); `pipeline/classify.ts` records
  `muse_override`. Oz `analysis.json`: 43 of 151 scenes.
- Re-splits: `pipeline/resplit.ts` asks Muse in the 0.15 to 0.3 margin band.
- Images: `server/images/meta.ts` posts `muse-image-1.0`.
- Models: `pipeline/build.ts` defaults to `muse-spark-1.3-contributor`;
  Standard for final passes and chat is the AGENTS.md rule. Chat is not
  built, and the README says so.
- Music is Musopen and Jamendo recordings and narration is Kokoro, so the
  README does not credit Meta for either.

## Findings

1. Two rescue commits (66b7d3f, 201b3e7) also carry the Muse trailer
   from an older hook run. The stats and the label workflow treat any
   commit with a `Rescue:` line as not Muse, so they are not counted.
2. The refresh commit is authored by `github-actions[bot]`; the script
   leaves those commits out of the totals so the share does not drift.
   GITHUB_TOKEN pushes trigger no workflows, so it cannot loop.
3. The stats workflow skips `npm ci`, so `prepare` never points git at
   `.githooks` there and the bot commit gets no Muse trailer.

Checks: `npm run test:hooks` (includes `scripts/muse-stats.test.mjs`),
size and secret hooks, gitleaks.
