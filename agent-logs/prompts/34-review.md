# Review task 34 (music-mode cycle)

Worktree /workspace/wt-34, branch `music-mode-cycle`. Read AGENTS.md. Review `git diff origin/main...HEAD` against docs/tasks/34-music-mode-cycle.md and agent-logs/prompts/34-impl.md (architecture review 6, candidate 1). Use the `ponytail-review` and `blast-radius` skills; if a skill cannot be loaded, do the analysis yourself with grep and continue. Never stop to ask.
Check in particular:
- nextMode/musicModes order and the 2-state fallback; styleHasTracks filter now lives in one place.
- modeAdvanced: style->style identical to styleChanged; style->Chopin identical to playlistToggled entering; Chopin->style is ONE switch with one crossfade and selection.style = target; guards (route null, unknown target, same mode) and whether the route-null guard placement differs from the old intents in a way that matters.
- startSession entering the playlist with nowSec 0 and fade 0: does a later tick / sceneEntered / trackEnded / skip / previous behave correctly with currentStartedSec 0 and no route yet, and does the player's first-press gating still apply? Any path that plays before the user's first press?
- The Chopin button pressed while on Chopin: the control keeps a `lastStyle` ref; after a reload that starts in Chopin the ref is empty and it falls back to the first style instead of the stored style. Judge whether the session should own this (e.g. modeAdvanced to the playlist id while on the playlist exits to selection.style, matching playlistToggled) so the control stays stateless.
- Persistence: every save site carries `playlist`, old stored values load, saving does not happen before prefs load.
- player.tsx still gets what it needs for loop-off; reader/player no longer know Chopin for the control. Current visuals preserved (classes, images, aria, labels), the one intended change (stickers enabled during Chopin) documented.
- Contracts docs (player.md stale player-controls line fixed, music-session/playlist-mode/selection updated) match the code. No "Generated" in UI copy.
Write docs/reviews/34.md in the style of docs/reviews/32.md: verdict (approve / changes needed), findings ranked with file:line, and what you ran. Run `npm test` and `npm run typecheck`. Fix nothing in code; only write the review file and commit it ("Add review 34"). Do not push. Do not run `next start`. No paid API calls.
