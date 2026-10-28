Task 19 on branch step-freshness (this worktree). Do not run `next start` or
`next dev`. Do not read or print secret values; never create .env files. Never
run `npm run build:book` without `--dry-run` (it calls paid APIs). Stay inside
pipeline/, core/ (only if needed), data/books/oz (stamp only, see 4) and the
docs named below.

Problem: freshness is decided per step with different ad-hoc rules.
segment, classify and cluster use `readIfFresh` (pipeline/cache.ts), keyed on
book textVersion only; resplit skips whenever `provenance.resplit` exists
(pipeline/resplit.ts); classify copies the previous `provenance.resplit`
onto its new output unchecked (pipeline/classify.ts, the `resplit` carry).
Sequence that breaks: `--step segment --force`, `--step classify --force`,
`--step resplit` -> resplit skips silently, analysis.json keeps a resplit
record describing scenes that no longer exist and the new scenes are never
resplit. Also `--step segment --force` then `--step classify` (no force)
reuses an analysis of the old scenes.

Design (implement this, keep it small, no framework, no new deps):
1. One helper module, pipeline/freshness.ts (replace pipeline/cache.ts; move
   or delete it and update callers):
   - `fingerprint(value: unknown): string` = sha256 hex (first 16 chars) of
     JSON.stringify(value). Callers pass plain arrays/objects in a fixed field
     order so it is deterministic.
   - `decide(force: boolean, recorded: string | undefined, current: string):
     { reuse: boolean; reason: string }` — reuse only when !force and
     recorded === current. Reasons: "forced", "no previous output",
     "inputs changed", "inputs unchanged".
   - One function per step that reads the files in a book dir and returns
     `{ recorded, current }` for that step (pure reads, no clients), plus
     `planSteps(dir, steps, force)` used by the dry run (below).
   Every step calls `decide` with its own pair; no other skip logic remains.
2. The rule per step (input -> where the key is recorded):
   - ingest: unchanged (its frozen textVersion rule stays as is).
   - segment: current = book.textVersion; recorded = scenes.json textVersion.
   - classify: current = fingerprint of scenes.json scenes (id, ch, start_n,
     end_n, title, summary, characters); recorded =
     analysis.json `provenance.input`. Classify writes `provenance.input`.
     It carries the old `provenance.resplit` only when that record's `input`
     equals the fingerprint of its new scenes' ranges (see resplit); else
     drops it.
   - resplit: current = fingerprint of analysis.json scene ranges (id,
     start_n, end_n); recorded = analysis.json `provenance.resplit.input`.
     Resplit writes `provenance.resplit.input` = fingerprint of the ranges it
     WROTE (its output is a fixed point: rerunning on its own output reuses),
     and also writes analysis `provenance.input` = classify fingerprint of
     the scenes.json it wrote, so a later classify reuses.
   - cluster: current = fingerprint of analysis scenes (id, final);
     recorded = music-clusters.json `provenance.input`. Cluster writes it.
   Missing or unparsable files/fields -> recorded undefined -> redo.
3. Dry run: `npm run build:book -- oz --dry-run [--step X] [--force]` prints
   one line per selected step, e.g. `classify: reuse (inputs unchanged)` or
   `resplit: redo (inputs changed)`, creates no clients, needs no API keys,
   writes nothing and makes no network calls (ingest prints `ingest: not checked
in dry run (frozen textVersion rule)`). In a multi-step plan, once a step would redo, every later
   selected step prints `redo (upstream step redoes)`.
4. Current Oz data (data/books/oz, 151 scenes) has no recorded keys yet and
   must stay valid and be reused. Stamp it once: with a throwaway tsx
   one-liner (do not commit the script) compute the keys with the new
   helper and add ONLY analysis.json `provenance.input`,
   `provenance.resplit.input` and music-clusters.json `provenance.input`,
   writing JSON exactly the way the pipeline writes it
   (`${JSON.stringify(obj)}\n`). Nothing else in those files may change;
   check that with a script comparing old vs new parsed objects minus the new
   fields, and show the result. scenes.json and book.json do not change.
5. Tests (vitest, tmpdirs and fake clients like pipeline/resplit.test.ts and
   pipeline/classify.test.ts):
   - decide/fingerprint unit cases.
   - the --force sequence: segment forced with new boundaries -> classify
     without force redoes; classify forced -> resplit does NOT skip and the
     stale resplit record is dropped; resplit on its own output reuses;
     cluster redoes when finals change and reuses otherwise.
   - a full unforced rerun over unchanged files reuses every step and calls
     no client (fake clients that throw if called).
   - planSteps over the real data/books/oz returns reuse for segment,
     classify, resplit, cluster.
   Existing tests stay green; adjust only what the new provenance field
   legitimately changes.
6. Docs: a short docs/tasks/19-step-freshness.md (the rule table above, the
   dry-run command, the stamp) and one line in BUILT_DURING_HACKATHON.md;
   update the pipeline/build.ts usage comment and string.

Normal full-run behaviour must not change: same outputs except the new
`input` provenance fields. Afterwards run `npm run build:book -- oz
--dry-run` and paste its output in your final message (it must say reuse for
all four steps after ingest).

Run npm test, npm run typecheck, npm run check:isolation, npm run
check:secrets, npm run test:hooks, npm run check:size. Commit through the
hook with message "One freshness rule per pipeline step" and trailer
"Co-authored-by: Muse Code (Meta) <muse-code@agents.noreply.invalid>".
