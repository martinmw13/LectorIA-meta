# Lectoria (Meta hackathon)

[![Built with Meta Muse](https://img.shields.io/badge/Built_with-Meta_Muse-0866FF)](#built-with-meta-muse)

Lectoria is an e-reader that plays orchestral music matched to the emotion of each scene of a public-domain book. Readers can also illustrate a passage or a scene and talk with a spoiler-free companion about the book.

Status: repo setup. App code starts after the architecture review.

## Setup

`npm install` installs the git hooks (or run `npm run prepare` directly). The hooks check staged file size and secrets and add the co-author trailer.

## Run it

```sh
npm ci
npm run dev     # local server at http://localhost:3000
npm test        # vitest suite
npm run typecheck
npm run build
```

## Checks

Opt-in scroll e2e (Python Playwright, not in CI): `python3 scripts/e2e-scroll.py [base_url]`.

## Built with Meta Muse

Meta's Muse built this repo and runs inside it.

**Muse Code wrote the code.** Nearly every commit carries the `Co-authored-by: Muse Code (Meta)` trailer. Each task has a design in [docs/tasks/](docs/tasks/), a review in [docs/reviews/](docs/reviews/) and a Muse Code session transcript in [agent-logs/](agent-logs/). The few changes made by other tools are listed in [RESCUE_LOG.md](RESCUE_LOG.md). [docs/MUSE.md](docs/MUSE.md) has the commit and line counts and the list of PRs, regenerated from git history on every push to main. PRs with Muse commits carry the `Muse Code` label.

**The book pipeline runs on Meta models** (`npm run build:book`, [pipeline/](pipeline/)):

- Cleaning: when the pipeline ingests an EPUB, sections the deterministic rules can't settle go to Muse Spark Open (`Muse-Spark-Open-816B-A42B`, open weights on a Modal endpoint), with the Meta API as fallback ([pipeline/clean-providers.ts](pipeline/clean-providers.ts)).
- Scenes: Muse Spark splits each chapter into scenes, one call per chapter with a JSON schema ([pipeline/segment.ts](pipeline/segment.ts)).
- Emotions: Jev classifies each scene. When Jev returns `unknown` or its confidence is under 0.6, Muse Spark overrides the emotion vector and the scene records the override ([pipeline/classify.ts](pipeline/classify.ts), [core/emotion.ts](core/emotion.ts)). In Oz that happened for 43 of 151 scenes.
- Re-splits: where the emotion shift inside a scene is borderline, Muse Spark decides whether to split it and records why ([pipeline/resplit.ts](pipeline/resplit.ts)).
- Images: "Picture this" illustrations come from Muse Image (`muse-image-1.0`) ([server/images/meta.ts](server/images/meta.ts)).

**Dev and production models.** Development, tests and the pipeline default use `muse-spark-1.3-contributor`, the cheaper development model. Muse Spark 1.3 Standard (`muse-spark-1.3`) is reserved for final passes and the public chat, which is not built yet (see [AGENTS.md](AGENTS.md)).

## Docs

- [AGENTS.md](AGENTS.md): agent instructions
- [SECURITY.md](SECURITY.md): how secrets and quotas work
- [PRIOR_WORK.md](PRIOR_WORK.md): relation to the March prototype
- [BUILT_DURING_HACKATHON.md](BUILT_DURING_HACKATHON.md): dated build log
- [docs/MUSE.md](docs/MUSE.md): what Muse Code wrote, from git history (`npm run muse:stats`)

License: MIT ([LICENSE](LICENSE)).
