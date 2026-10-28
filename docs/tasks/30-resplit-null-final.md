# Task 30: resplit keeps the scene whole on a null re-classified part

`runResplit` re-classifies each split part with `classifyScene`, which
never throws: a Jev failure or a failed override returns
`{ final: null, error }`. Until now a part (or a merged-group
re-classify) with `final: null` was stored anyway, with
`final_left`/`final_right: null` and no failure entry. That was the
only path that stored a success with a null final.

If any stored part of a split scene ends with `emotion.final === null`,
the scene now stays whole: nothing from the split is stored and one
`{ from, reason: "null-final" }` entry lands in the new
`provenance.resplit.reclassify_failures` list, shaped like
`window_failures` and `muse_failures`. Usage and spend already
incurred stay counted, and `merged_back` entries for that scene are
dropped with the split. `museFailureReason` is exported for tests;
behavior is otherwise unchanged.
