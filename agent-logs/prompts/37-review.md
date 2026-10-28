# Review task 37 (music prefs owner)

Worktree /workspace/wt-38, branch `music-prefs-owner`. Read AGENTS.md. Review `git diff origin/main...HEAD` against docs/tasks/37-music-prefs-owner.md and agent-logs/prompts/37-impl.md. Use the `ponytail-review` and `blast-radius` skills; if a skill cannot be loaded, do the analysis yourself with grep and continue. Never stop to ask.
Check in particular:
- The bug is really gone: volume/mute before the manifest loads, or after it fails, keep the stored style and playlist. Is there any remaining save path in app/ that writes the full object from partial knowledge?
- Store semantics: load caches vs re-reads; update before load; startSession now receives store.load() after possible early updates (does it get the merged value, and can that change startup vs before when nothing was stored, e.g. style null vs prefs null?).
- Hydration: no storage access during render (createMusicPrefsStore in useRef initial value must not touch localStorage).
- Guarded storage (private mode, throwing setItem/getItem, no window), validation unchanged, old values load.
- Tests cover the regression and pin behavior, not implementation. Docs/contracts match code. Diff in reader.tsx limited to prefs lines; app/player.tsx, music-style-control.tsx, core/music-session.ts untouched.
Write docs/reviews/37.md in the style of docs/reviews/34.md: verdict (approve / changes needed), findings ranked with file:line, and what you ran. Run `npm test` and `npm run typecheck`. Fix nothing in code; only write the review file and commit it ("Add review 37"). Do not push. Do not run `next start`. No paid API calls.
