# Task 19: one freshness rule per pipeline step

Each step reuses its output only when `--force` is off and the key its
last run recorded still matches its current input. Otherwise it redoes
the step. The rule lives in `pipeline/freshness.ts`:

| Step | Current input | Recorded key |
|---|---|---|
| segment | book textVersion | scenes.json textVersion |
| classify | fingerprint of scenes (id, ch, start_n, end_n, title, summary, characters) | analysis.json `provenance.input` |
| resplit | fingerprint of analysis scene ranges (id, start_n, end_n) | analysis.json `provenance.resplit.input` |
| cluster | fingerprint of analysis scenes (id, final) | music-clusters.json `provenance.input` |

Classify carries the old `provenance.resplit` only when its `input`
still matches the new scenes' ranges, else drops it. Resplit writes
`provenance.resplit.input` for the ranges it wrote plus
`provenance.input` for the scenes it wrote, so a later classify
reuses. Ingest keeps its frozen textVersion rule.

Dry run prints one line per selected step without clients, keys, writes,
or network:

`npm run build:book -- oz --dry-run [--step X] [--force]`

In a multi-step plan, once a step would redo, every later selected step
prints `redo (upstream step redoes)`.

Oz stamp: the committed Oz data had no recorded keys, so
`provenance.input`, `provenance.resplit.input`, and the cluster
`provenance.input` were backfilled with the helper. Nothing else in
those files changed.
