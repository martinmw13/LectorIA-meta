Review step for task 4 (Standard). Review the uncommitted working tree on branch `pipeline-oz` against main (`git diff main` plus untracked files: core/, pipeline/, data/books/, tsconfig.json, vitest.config.ts, package.json, scripts/check-file-size.*). The design is docs/tasks/04-pipeline-oz.md; the spec it implements is in agent-logs/prompts/04-impl.md if present, else /workspace/muse-prompts/04-impl.md. Read AGENTS.md and SECURITY.md first. Use the ponytail-review skill (.agents/skills/ponytail-review/SKILL.md) and typescript-best-practices. Do not edit code. Write ONLY docs/reviews/04.md in the style of docs/reviews/02.md (verdict line, numbered findings with severity blocker/should-fix/nit, file:line, problem, fix), unslop prose, under 5000 tokens.

Check in particular:
- core/ purity (no env, fs, fetch, node imports), secrets never printed or logged, no request headers in errors, no audio/Modal code.
- Scene coverage: run the validators on the committed data; no gaps, overlaps or chapter crossings; ids compared by n.
- Hard failures never store a fake vector; override only returns the 8 ids; final vectors sum to 1.
- Stored field naming: the spec asked for snake_case data fields (intensity_confidence, tempo_confidence); check data files are consistent and whether camelCase like inputTokens leaks into analysis.json.
- k-means determinism and the music prompts: the spec asked for minor variants for sad or dark moods, dynamics that follow intensity, and prompts distinct enough across the 15 clusters while sharing one orchestra. Read data/books/oz/music-clusters.json and judge whether the 15 prompts would yield usefully different tracks (for example combate clusters marked "moderate dynamics", identical mood text in two clusters, every prompt in a major key).
- Plausibility: read the scenes for the cyclone (chapter 1), Kalidahs (7), poppies (8), Winged Monkeys (14) and say whether their final emotions fit.
- Tests prove behavior; cost accounting correct (Meta contributor 0.10 input, 0.002 cached, 0.20 output per 1M; Jev 0.042 per 1M input).
- Ponytail: anything that can be deleted or is overbuilt.
Run `npm test` and `npm run typecheck` and report the result.
