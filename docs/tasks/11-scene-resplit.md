# Task 11: re-split scenes at strong sequential emotion shifts

A scene must hold one mood, since music changes only at scene
boundaries. Oz has 133 scenes; 28 have top final probability below
0.5 and 17 have a top-2 gap below 0.15, so some scenes mix moods
(calm, then the cyclone).

New pipeline step `resplit` runs after `classify` and before
`cluster`. It reads book.json and analysis.json and rewrites
scenes.json and analysis.json. A scene is a candidate when it has
more than 350 words, a top probability below 0.5, or a top-2 gap
below 0.15. Scenes under 240 words never split, and scenes with no
vector stay as they are.

Each candidate is cut into consecutive windows of whole paragraphs,
about 100 to 160 words each, and each window is classified with the
Jev client. The pure rule in `core/resplit.ts` scores each boundary:
with L and R the word-weighted mean vectors left and right, and a
and b their top emotions, the margin is min(L[a]-L[b], R[b]-R[a])
when a and b differ. Each side must hold at least 120 words, and a
one-window spike does not count as persistence.

A margin at or above 0.30 splits at once. A margin from 0.15 to 0.30
asks Muse, which sees two paragraphs each side plus both vectors and
answers split or not with a reason. Below 0.15 nothing splits.
Target is 5 to 30 splits on Oz.

The first part keeps the scene id so old links keep working; later
parts add a letter suffix (`c5s2b`, `c5s2c`). One Meta call per split
scene writes titles, summaries, and characters; each part is
re-classified with the standard classify path. Coverage validation
runs before writing. Provenance lands under `provenance.resplit`,
and the step skips when that entry exists unless forced. A first part
keeps its "Picture scene" image key; no such image is live yet.
